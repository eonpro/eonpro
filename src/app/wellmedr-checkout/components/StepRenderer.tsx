'use client';

import { PatientData } from '@/app/wellmedr-checkout/types/fillout';
import { useCheckoutStep } from '@/app/wellmedr-checkout/providers/CheckoutStepProvider';
import ApprovalStep from './steps/ApprovalStep';
import ShippingStep from './steps/ShippingStep';
import PaymentStep from './steps/PaymentStep';
import OrderSummary from './OrderSummary';

interface StepRendererProps {
  uid: string;
  patientData: PatientData;
}

export default function StepRenderer({ uid, patientData }: StepRendererProps) {
  const { currentStep, goToStep } = useCheckoutStep();

  if (currentStep === 'approval') {
    return <ApprovalStep patientData={patientData} />;
  }

  return (
    <div
      id="checkout-step-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 outline-none sm:px-6 sm:pt-8"
    >
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm" style={{ color: '#767676' }}>
        <button onClick={() => goToStep('approval')} className="hover:underline">
          Choose
        </button>
        <span aria-hidden="true">›</span>
        <span className="font-medium" style={{ color: '#101010' }} aria-current="page">
          Checkout
        </span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          {currentStep === 'shipping' && <ShippingStep uid={uid} />}
          {currentStep === 'payment' && <PaymentStep uid={uid} />}
        </div>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <h2 className="mb-4 text-xl font-bold" style={{ color: '#101010' }}>
            Order Summary
          </h2>
          <OrderSummary />
        </div>
      </div>
    </div>
  );
}
