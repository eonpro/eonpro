'use client';

import { useFormContext } from 'react-hook-form';
import PaymentSection from '../payment/PaymentSection';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';

interface PaymentStepProps {
  uid: string;
}

/**
 * PaymentStep - Simplified payment step that renders Elements immediately
 *
 * Subscription creation is now deferred to when the user submits payment.
 * This provides faster initial rendering and better UX.
 */
export default function PaymentStep({ uid }: PaymentStepProps) {
  const { watch } = useFormContext<CheckoutFormData>();

  const planDetails = watch('planDetails');
  const selectedProduct = watch('selectedProduct');

  // Validate required data before rendering payment form
  if (!planDetails || !selectedProduct) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-6 pt-2 sm:pt-8">
        <div className="flex w-full flex-col gap-6 sm:gap-8">
          <h3 className="text-center">Payment method</h3>
          <div className="card flex flex-col items-center gap-4 py-8 sm:gap-6">
            <div className="text-center text-amber-600">
              Please select a plan before proceeding to payment.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-6 pt-2 sm:pt-8">
      <PaymentSection submissionId={uid} />
    </div>
  );
}
