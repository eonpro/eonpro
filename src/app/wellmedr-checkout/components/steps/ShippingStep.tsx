'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import * as Sentry from '@sentry/nextjs';
import ShippingSection from '../ShippingSection';
import BillingSection from '../BillingSection';
import CheckboxField from '@/app/wellmedr-checkout/components/ui/CheckboxField';
import Button from '@/app/wellmedr-checkout/components/ui/button/Button';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';
import { useCheckoutStep } from '@/app/wellmedr-checkout/providers/CheckoutStepProvider';
import { PATIENT_DATA_KEY, INTAKE_RESPONSES_KEY, PATIENT_ID_KEY } from '@/app/wellmedr-checkout/lib/session-keys';

interface ShippingStepProps {
  uid: string;
}

function readSessionJSON<T = unknown>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

interface PatientSessionData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dob?: string;
  sex?: string;
  weight?: string | number;
  goalWeight?: string | number;
}

interface IntakeResponses {
  allergies?: string[];
  medications?: string[];
  healthConditions?: string[];
  glp1Type?: string;
  contraindications?: string[];
  [key: string]: unknown;
}

async function createPatientProfile(formData: CheckoutFormData): Promise<string | null> {
  const patientData = readSessionJSON<PatientSessionData>(PATIENT_DATA_KEY);
  const intakeResponses = readSessionJSON<IntakeResponses>(INTAKE_RESPONSES_KEY);

  if (!patientData?.email) return null;

  const payload = {
    firstName: formData.shippingAddress?.firstName || patientData.firstName || '',
    lastName: formData.shippingAddress?.lastName || patientData.lastName || '',
    email: patientData.email,
    phone: patientData.phone || '',
    dob: patientData.dob || '',
    sex: patientData.sex || 'unknown',
    shippingAddress: {
      address: formData.shippingAddress?.address || '',
      apt: formData.shippingAddress?.apt || '',
      city: formData.shippingAddress?.city || '',
      state: formData.shippingAddress?.state || '',
      zipCode: formData.shippingAddress?.zipCode || '',
    },
    weight: patientData.weight,
    goalWeight: patientData.goalWeight,
    intakeSummary: intakeResponses
      ? {
          healthConditions: intakeResponses.healthConditions ?? [],
          allergies: intakeResponses.allergies ?? [],
          medications: intakeResponses.medications ?? [],
          glp1Type: intakeResponses.glp1Type ?? '',
          contraindications: intakeResponses.contraindications ?? [],
        }
      : undefined,
  };

  const res = await fetch('/api/wellmedr/create-patient-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Profile creation failed: ${res.status}`);

  const result = await res.json();
  return result.patientId ? String(result.patientId) : null;
}

export default function ShippingStep({ uid: _uid }: ShippingStepProps) {
  const { trigger, watch, getValues } = useFormContext<CheckoutFormData>();
  const { goToNextStep } = useCheckoutStep();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBillingSameAsShipping = watch('shippingAddress.billingAddressSameAsShipment');

  const handleContinue = async () => {
    const shippingFields = [
      'shippingAddress.firstName',
      'shippingAddress.lastName',
      'shippingAddress.address',
      'shippingAddress.city',
      'shippingAddress.state',
      'shippingAddress.zipCode',
    ] as const;

    const billingFields = [
      'billingAddress.firstName',
      'billingAddress.lastName',
      'billingAddress.address',
      'billingAddress.city',
      'billingAddress.state',
      'billingAddress.zipCode',
    ] as const;

    const isShippingValid = await trigger([...shippingFields]);

    let isBillingValid = true;
    if (!isBillingSameAsShipping) {
      isBillingValid = await trigger([...billingFields]);
    }

    if (isShippingValid && isBillingValid) {
      const formData = getValues();

      // Create patient profile (non-blocking — proceed even if it fails)
      setIsSubmitting(true);
      try {
        const patientId = await createPatientProfile(formData);
        if (patientId) {
          sessionStorage.setItem(PATIENT_ID_KEY, patientId);
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { module: 'wellmedr-checkout', op: 'create-patient-profile' },
        });
      } finally {
        setIsSubmitting(false);
      }

      if (formData.planDetails && formData.selectedProduct && typeof window !== 'undefined' && window.dataLayer) {
        window.dataLayer.push({
          event: 'add_shipping_info',
          ecommerce: {
            currency: 'USD',
            value: formData.planDetails.totalPayToday,
            shipping_tier: 'standard',
            items: [
              {
                item_id: formData.planDetails.id,
                item_name: `${formData.selectedProduct.name} - ${formData.selectedProduct.medicationType}`,
                price: formData.planDetails.totalPayToday,
                quantity: 1,
              },
            ],
          },
        });
      }
      goToNextStep();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleContinue();
      }}
      autoComplete="off"
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-6 pt-2 sm:pt-8"
    >
      <ShippingSection />
      <div className="w-full">
        <CheckboxField
          name="shippingAddress.billingAddressSameAsShipment"
          label="Shipping and billing address are the same"
        />
      </div>
      <BillingSection />
      <div className="sticky bottom-0 z-10 -mx-4 bg-white px-4 pb-[env(safe-area-inset-bottom)] pt-3 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0">
        <Button onClick={handleContinue} text={isSubmitting ? 'Saving...' : 'Continue'} disabled={isSubmitting} />
      </div>
    </form>
  );
}
