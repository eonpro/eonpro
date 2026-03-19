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
      <div className="w-full flex flex-col gap-8 max-w-3xl mx-auto pt-2 sm:pt-8 pb-6">
        <div className="w-full flex flex-col gap-6 sm:gap-8">
          <h3 className="text-center">Payment method</h3>
          <div className="flex flex-col gap-4 sm:gap-6 card items-center py-8">
            <div className="text-amber-600 text-center">
              Please select a plan before proceeding to payment.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 max-w-3xl mx-auto pt-2 sm:pt-8 pb-6">
      <PaymentSection submissionId={uid} />
    </div>
  );
}
