import cn from '@/app/wellmedr-checkout/lib/cn';
import { Plan, PlanOptions } from '@/app/wellmedr-checkout/types/checkout';

interface PlanCardProps {
  plan: Plan;
  handlePlanSelect: (planId: PlanOptions) => void;
  selectedPlan: PlanOptions;
}

export default function PlanCard({
  plan,
  handlePlanSelect,
  selectedPlan,
}: PlanCardProps) {
  const isSelected = selectedPlan === plan.id;

  return (
    <div
      onClick={() => handlePlanSelect(plan.id)}
      className={cn(
        'relative cursor-pointer border rounded-2xl p-5 sm:p-6 bg-white w-full min-w-[280px] transition-all duration-300 hover:border-primary hover:shadow-md',
        isSelected ? 'border-primary shadow-md' : 'border-border',
      )}
    >
      {/* Checkbox indicator */}
      <div className="absolute top-4 right-4">
        <div
          className={cn(
            'w-6 h-6 rounded border-2 flex items-center justify-center transition-all',
            isSelected ? 'bg-primary border-primary' : 'border-border',
          )}
        >
          {isSelected && (
            <svg
              className="w-4 h-4 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">{plan.title}</p>
        <p className="text-foreground/70 text-lg">
          Pay ${plan.totalPayToday} today
        </p>
      </div>

      <div className="flex justify-between gap-2 items-end mt-4">
        {plan.savings && plan.savings > 0 ? (
          <div>
            <span className="text-white py-1.5 px-3 rounded-lg text-sm font-medium whitespace-nowrap bg-primary">
              You save ${plan.savings}
            </span>
          </div>
        ) : (
          <div aria-hidden />
        )}

        <div className="flex items-center gap-2">
          {plan.originalPrice && plan.originalPrice > 0 && (
            <span className="opacity-30 line-through text-base sm:text-xl">
              ${plan.originalPrice}
            </span>
          )}
          <p className="text-foreground">
            <span className="font-semibold text-xl">${plan.monthlyPrice}</span>
            <span className="text-foreground/70">/month</span>
          </p>
        </div>
      </div>
    </div>
  );
}
