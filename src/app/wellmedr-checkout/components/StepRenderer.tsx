'use client';

import { PatientData } from '@/app/wellmedr-checkout/types/fillout';
import { useCheckoutStep } from '@/app/wellmedr-checkout/providers/CheckoutStepProvider';
import ApprovalStep from './steps/ApprovalStep';
import ShippingStep from './steps/ShippingStep';
import PaymentStep from './steps/PaymentStep';
import OrderSummary from './OrderSummary';
import ShippingSidebar from './ShippingSidebar';

interface StepRendererProps {
  uid: string;
  patientData: PatientData;
}

export default function StepRenderer({ uid, patientData }: StepRendererProps) {
  const { currentStep, goToStep } = useCheckoutStep();

  // Step 1: Shipping — form on left, social proof sidebar on right
  if (currentStep === 'shipping') {
    return (
      <div
        id="checkout-step-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 outline-none sm:px-6 sm:pt-8"
      >
        <h1 className="sr-only">Shipping</h1>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <ShippingStep uid={uid} />
          </div>
          <div className="hidden lg:block lg:pt-8">
            <ShippingSidebar />
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Treatment selection (approval) — full-width
  if (currentStep === 'approval') {
    return (
      <div id="checkout-step-content" tabIndex={-1} className="outline-none">
        <ApprovalStep patientData={patientData} />
      </div>
    );
  }

  // Step 3: Payment — form on left, order summary on right
  return (
    <div
      id="checkout-step-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 outline-none sm:px-6 sm:pt-8"
    >
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-2 text-sm"
        style={{ color: '#767676' }}
      >
        <button onClick={() => goToStep('approval')} className="px-1 py-2 hover:underline">
          Choose
        </button>
        <span aria-hidden="true">&rsaquo;</span>
        <span className="font-medium" style={{ color: '#101010' }} aria-current="page">
          Checkout
        </span>
      </nav>

      <h1 className="sr-only">Payment</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="order-2 lg:order-1">
          <PaymentStep uid={uid} />
        </div>
        <div className="order-1 lg:sticky lg:top-8 lg:order-2 lg:self-start">
          <h2 className="mb-4 text-lg font-bold" style={{ color: '#101010' }}>
            Order Summary
          </h2>
          <OrderSummary />
        </div>
      </div>
    </div>
  );
}
