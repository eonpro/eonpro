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
  const { currentStep } = useCheckoutStep();

  if (currentStep === 'approval') {
    return <ApprovalStep patientData={patientData} />;
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-8 pb-8">
      <div className="flex items-center gap-2 text-sm mb-6" style={{ color: '#999' }}>
        <button onClick={() => window.history.back()} className="hover:underline">Choose</button>
        <span>›</span>
        <span className="font-medium" style={{ color: '#101010' }}>Checkout</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Left: Shipping + Payment */}
        <div>
          {currentStep === 'shipping' && <ShippingStep uid={uid} />}
          {currentStep === 'payment' && <PaymentStep uid={uid} />}
        </div>

        {/* Right: Order Summary */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#101010' }}>Order Summary</h2>
          <OrderSummary />
        </div>
      </div>
    </div>
  );
}
