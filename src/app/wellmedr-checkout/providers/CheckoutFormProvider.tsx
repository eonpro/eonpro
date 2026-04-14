'use client';

import { ReactNode, useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';
import { stateNameToAbbreviation, StateAbbreviation } from '@/app/wellmedr-checkout/lib/states';
import { PatientData } from '@/app/wellmedr-checkout/types/fillout';
import { checkoutFormSchema } from '@/app/wellmedr-checkout/lib/validations/checkout';
import { logger } from '@/app/wellmedr-checkout/utils/logger';

const FORM_STORAGE_KEY = 'wellmedr_checkout_form';
const SUBSCRIPTION_STORAGE_KEY = 'wellmedr_subscription_id';

// Fields to persist in sessionStorage (excludes sensitive card data)
type PersistedFormData = Omit<CheckoutFormData, 'cardholderName'>;

function getStoredSubscriptionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = sessionStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (id) {
      console.log('[Subscription Storage] Retrieved subscription ID:', id);
    }
    return id;
  } catch (e) {
    console.error('Failed to get subscription ID:', e);
  }
  return null;
}

function clearSubscriptionId() {
  if (typeof window === 'undefined') return;
  try {
    const existingId = sessionStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    sessionStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
    if (existingId) {
      console.log('[Subscription Storage] Cleared subscription ID from form provider:', existingId);
    }
  } catch (e) {
    console.error('Failed to clear subscription ID:', e);
  }
}

function getStoredFormData(): Partial<PersistedFormData> | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(FORM_STORAGE_KEY);
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
    sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(toStore));
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

  // Fetch order data from Airtable if subscription ID exists in sessionStorage
  // This allows recovering shipping/billing data from a previous order attempt
  useEffect(() => {
    const fetchOrderData = async () => {
      const subscriptionId = getStoredSubscriptionId();
      if (!subscriptionId) return;

      // Skip if we already have shipping address data in sessionStorage
      const storedData = getStoredFormData();
      if (storedData?.shippingAddress?.address) return;

      try {
        const response = await fetch(
          `/api/get-order?subscriptionId=${encodeURIComponent(subscriptionId)}`
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

          // If subscription is already active/successful, clear storage and redirect to thank-you
          if (subscriptionStatus === 'active' && paymentStatus === 'succeeded') {
            clearSubscriptionId();
            // Get uid from URL params
            const urlParams = new URLSearchParams(window.location.search);
            const uid = urlParams.get('uid');
            if (uid) {
              window.location.href = `/thank-you?uid=${uid}`;
              return;
            }
          }

          // Update form with order data if available
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

          console.log('Form initialized with order data from Airtable');
        }
      } catch (e) {
        logger.error('Failed to fetch order data:', e);
      }
    };

    fetchOrderData();
  }, [methods, patientData, stateAbbr]);

  return <FormProvider {...methods}>{children}</FormProvider>;
}
