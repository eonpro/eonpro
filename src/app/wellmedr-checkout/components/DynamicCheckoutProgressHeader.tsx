'use client';

import CheckoutProgressHeader from '@/app/wellmedr-checkout/components/ui/CheckoutProgressHeader';
import { useCheckoutStep } from '@/app/wellmedr-checkout/providers/CheckoutStepProvider';

export default function DynamicCheckoutProgressHeader() {
  const { currentStep } = useCheckoutStep();
  return <CheckoutProgressHeader currentStep={currentStep} />;
}
