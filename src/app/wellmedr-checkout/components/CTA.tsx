'use client';

import Button from '@/app/wellmedr-checkout/components/ui/button/Button';
import { useCheckout } from '@/app/wellmedr-checkout/hooks/useCheckout';
import { useCheckoutStep } from '@/app/wellmedr-checkout/providers/CheckoutStepProvider';

export default function CTA({ id }: { id: string }) {
  const { selectedProduct, selectedPlan, plans, addonTotal } = useCheckout();
  const { goToNextStep } = useCheckoutStep();

  if (!selectedProduct) return null;

  const selectedPlanDetails = plans.find((p) => p.id === selectedPlan);

  const getPlanDisplayInfo = () => {
    const activePlan = selectedPlanDetails || plans[0];

    if (!activePlan) {
      return {
        price: 0,
        text: 'Pay one month at a time.',
        frequency: 'per month',
      };
    }

    switch (activePlan.plan_type) {
      case 'quarterly':
        return {
          price: activePlan.totalPayToday,
          text: 'Pay three months at a time.',
          frequency: 'for 3 months',
        };
      case 'sixMonth':
        return {
          price: activePlan.totalPayToday,
          text: 'Pay six months at a time.',
          frequency: 'for 6 months',
        };
      case 'annual':
        return {
          price: activePlan.totalPayToday,
          text: 'Pay twelve months at a time.',
          frequency: 'for 12 months',
        };
      case 'monthly':
      default:
        return {
          price: activePlan.monthlyPrice,
          text: 'Pay one month at a time.',
          frequency: 'per month',
        };
    }
  };

  const {
    price,
    text: planText,
    frequency: frequencyLabel,
  } = getPlanDisplayInfo();

  const totalPrice = price + addonTotal;

  return (
    <div className="text-center mx-auto flex flex-col gap-6 sm:gap-8" id={id}>
      <div>
        <h3 className="sm:whitespace-nowrap checkout-title text-center">
          <span className="capitalize">{selectedProduct.name}</span> prescribed{' '}
          <span className="inline sm:hidden">
            <br />
          </span>
          for just ${totalPrice} {frequencyLabel}
        </h3>
        <p>
          {planText} No contracts, cancel anytime. Medication is included.
          {addonTotal > 0 && (
            <span className="block text-sm text-primary mt-1">
              Includes ${addonTotal} in add-ons
            </span>
          )}
        </p>
      </div>

      <Button
        onClick={goToNextStep}
        text="Continue to Shipping"
        className="max-w-sm mx-auto"
      />
    </div>
  );
}
