'use client';

import { ReactNode, useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';
import { stateNameToAbbreviation, StateAbbreviation } from '@/app/wellmedr-checkout/lib/states';
import { PatientData } from '@/app/wellmedr-checkout/types/fillout';
import { checkoutFormSchema } from '@/app/wellmedr-checkout/lib/validations/checkout';
import { logger } from '@/app/wellmedr-checkout/utils/logger';
import { CHECKOUT_FORM_KEY, SUBSCRIPTION_ID_KEY } from '@/app/wellmedr-checkout/lib/session-keys';

// Fields to persist in sessionStorage (excludes sensitive card data)
type PersistedFormData = Omit<CheckoutFormData, 'cardholderName'>;

function getStoredSubscriptionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(SUBSCRIPTION_ID_KEY);
  } catch (e) {
    logger.error('Failed to get subscription ID');
  }
  return null;
}

function getStoredFormData(): Partial<PersistedFormData> | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(CHECKOUT_FORM_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    logger.error('Failed to parse stored form data:', e);
  }
  return null;
}

function storeFormData(data: Partial<PersistedFormData>) {
  if (typeof window === 'undefined') return;
  try {
    // Don't store cardholderName for security
    const { ...toStore } = data;
    sessionStorage.setItem(CHECKOUT_FORM_KEY, JSON.stringify(toStore));
  } catch (e) {
    logger.error('Failed to store form data:', e);
  }
}

interface CheckoutFormProviderProps {
  children: ReactNode;
  patientData?: PatientData;
}

export default function CheckoutFormProvider({ children, patientData }: CheckoutFormProviderProps) {
  const stateAbbr = patientData?.state
    ? (stateNameToAbbreviation(patientData.state) as StateAbbreviation)
    : '';

  // Get stored data to merge with defaults
  const storedData = getStoredFormData();

  const methods = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutFormSchema) as any,
    defaultValues: {
      selectedProduct: storedData?.selectedProduct || null,
      selectedPlan: storedData?.selectedPlan || '',
      planDetails: storedData?.planDetails || null,
      shippingAddress: storedData?.shippingAddress || {
        firstName: patientData?.firstName || '',
        lastName: patientData?.lastName || '',
        address: '',
        apt: '',
        city: '',
        state: stateAbbr,
        zipCode: '',
        billingAddressSameAsShipment: true,
      },
      billingAddress: storedData?.billingAddress || {
        firstName: patientData?.firstName || '',
        lastName: patientData?.lastName || '',
        address: '',
        apt: '',
        city: '',
        state: stateAbbr,
        zipCode: '',
      },
      selectedAddons: storedData?.selectedAddons || [],
      cardholderName: '',
      email: storedData?.email || patientData?.email || '',
      phone: storedData?.phone || patientData?.phone || '',
      weight: storedData?.weight || patientData?.weight || 0,
      goalWeight: storedData?.goalWeight || patientData?.goalWeight || 0,
      firstName: storedData?.firstName || patientData?.firstName || '',
      lastName: storedData?.lastName || patientData?.lastName || '',
      state: storedData?.state || patientData?.state || '',
      bmi: storedData?.bmi || patientData?.bmi || 0,
      dateOfBirth: storedData?.dateOfBirth || patientData?.dateOfBirth || '',
      sex: storedData?.sex || patientData?.sex || '',
    },
    mode: 'onChange',
  });

  // Persist form data on changes (debounced via subscription)
  useEffect(() => {
    const subscription = methods.watch((data) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cardholderName, ...toStore } = data as CheckoutFormData;
      storeFormData(toStore);
    });
    return () => subscription.unsubscribe();
  }, [methods]);

  // Recover order data from Stripe if a subscription ID exists in sessionStorage.
  // This handles page refresh / redirect-back scenarios by querying Stripe Connect
  // directly (not Airtable or in-memory store). Stripe is the source of truth.
  useEffect(() => {
    const fetchOrderData = async () => {
      const subscriptionId = getStoredSubscriptionId();
      if (!subscriptionId) return;

      const storedData = getStoredFormData();
      if (storedData?.shippingAddress?.address) return;

      try {
        const response = await fetch(
          `/api/wellmedr/get-order?subscriptionId=${encodeURIComponent(subscriptionId)}`
        );
        const data = await response.json();

        if (data.exists && data.order) {
          const {
            shippingAddress,
            billingAddress,
            customerEmail,
            subscriptionStatus,
            paymentStatus,
          } = data.order;

          if (subscriptionStatus === 'active' && paymentStatus === 'succeeded') {
            const urlParams = new URLSearchParams(window.location.search);
            const uid = urlParams.get('uid');
            if (uid) {
              window.location.href = `/wellmedr-checkout/thank-you?uid=${encodeURIComponent(uid)}`;
              return;
            }
          }

          if (shippingAddress) {
            methods.setValue('shippingAddress', {
              firstName: shippingAddress.firstName || patientData?.firstName || '',
              lastName: shippingAddress.lastName || patientData?.lastName || '',
              address: shippingAddress.address || '',
              apt: shippingAddress.apt || '',
              city: shippingAddress.city || '',
              state: shippingAddress.state || stateAbbr,
              zipCode: shippingAddress.zipCode || '',
              billingAddressSameAsShipment: shippingAddress.billingAddressSameAsShipment ?? true,
            });
          }

          if (billingAddress && !shippingAddress?.billingAddressSameAsShipment) {
            methods.setValue('billingAddress', {
              firstName: billingAddress.firstName || '',
              lastName: billingAddress.lastName || '',
              address: billingAddress.address || '',
              apt: billingAddress.apt || '',
              city: billingAddress.city || '',
              state: billingAddress.state || '',
              zipCode: billingAddress.zipCode || '',
            });
          }

          if (customerEmail && !methods.getValues('email')) {
            methods.setValue('email', customerEmail);
          }
        }
      } catch (e) {
        logger.error('Failed to fetch order data from Stripe:', e);
      }
    };

    fetchOrderData();
  }, [methods, patientData, stateAbbr]);

  return <FormProvider {...methods}>{children}</FormProvider>;
}
