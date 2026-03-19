'use client';

import PlanCard from '../PlanCard';
import PlansHeader from '../PlansHeader';
import { Plan } from '@/app/wellmedr-checkout/types/checkout';
import { useCheckout } from '@/app/wellmedr-checkout/hooks/useCheckout';

const Plans = () => {
  const { plans, selectedPlan, handlePlanSelect } = useCheckout();

  const handlePlanSelectWithScroll = (planId: any) => {
    handlePlanSelect(planId);

    setTimeout(() => {
      const ctaElement = document.getElementById('cta');
      if (ctaElement) {
        ctaElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 50);
  };

  return (
    <section className="flex flex-col gap-6 sm:gap-8 w-full">
      <PlansHeader />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(max(calc(50%-0.5rem),280px),1fr))] gap-4 [&>*:last-child:nth-child(odd)]:col-span-full">
        {plans.map((plan: Plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            handlePlanSelect={handlePlanSelectWithScroll}
            selectedPlan={selectedPlan}
          />
        ))}
      </div>
    </section>
  );
};

export default Plans;
