'use client';

import { PatientData } from '@/app/wellmedr-checkout/types/fillout';
import { useCheckoutStep } from '@/app/wellmedr-checkout/providers/CheckoutStepProvider';
import ApprovalStep from './steps/ApprovalStep';
import ShippingStep from './steps/ShippingStep';
import PaymentStep from './steps/PaymentStep';

interface StepRendererProps {
  uid: string;
  patientData: PatientData;
}

export default function StepRenderer({ uid, patientData }: StepRendererProps) {
  const { currentStep } = useCheckoutStep();

  switch (currentStep) {
    case 'shipping':
      return <ShippingStep uid={uid} />;
    case 'payment':
      return <PaymentStep uid={uid} />;
    case 'approval':
    default:
      return <ApprovalStep patientData={patientData} />;
  }
}
