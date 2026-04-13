'use client';

import cn from '@/app/wellmedr-checkout/lib/cn';
import { Plan, PlanOptions } from '@/app/wellmedr-checkout/types/checkout';

interface PlanCardProps {
  plan: Plan;
  handlePlanSelect: (planId: PlanOptions) => void;
  selectedPlan: PlanOptions;
  features?: string[];
}

const planFeatures: Record<string, string[]> = {
  monthly: [
    'Same price every month — no increases ever',
    'Physician-guided dosing, adjusted as needed',
  ],
  quarterly: [
    'Same medications, same care',
    'Fewer shipments',
    'Better consistency',
    'Same price regardless of dosage',
  ],
  sixMonth: [
    'Highest long-term success',
    'Preferred by patients who want to lose 10%+ of body weight',
    'Price stays the same regardless of dosage',
  ],
  annual: [
    'Maximum savings',
    'Best long-term weight loss results',
    'Price stays the same regardless of dosage',
  ],
};

export default function PlanCard({ plan, handlePlanSelect, selectedPlan }: PlanCardProps) {
  const isSelected = selectedPlan === plan.id;
  const features = planFeatures[plan.plan_type] || [];
  const months = plan.plan_type === 'annual' ? 12 : plan.plan_type === 'sixMonth' ? 6 : plan.plan_type === 'quarterly' ? 3 : 1;

  return (
    <div className={cn(
      'relative border rounded-2xl p-5 sm:p-6 bg-white w-full transition-all duration-200',
      isSelected ? 'border-green-500 shadow-lg shadow-green-100' : 'border-gray-200',
    )}>
      {plan.isBestValue && (
        <div className="mb-3">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-white bg-green-500">
            ★ BEST VALUE
          </span>
        </div>
      )}

      <p className="font-bold text-base tracking-wide mb-1" style={{ color: '#101010' }}>{plan.title}</p>

      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-3xl sm:text-4xl font-bold text-green-600">${plan.monthlyPrice}</span>
        <span className="text-base text-gray-500">/month</span>
      </div>

      {plan.savings && plan.savings > 0 && (
        <p className="text-green-600 text-sm font-medium italic mb-4">
          ${plan.totalPayToday} due today - save <span className="font-bold">${plan.savings}</span>
        </p>
      )}

      {!plan.savings && (
        <p className="text-gray-500 text-sm mb-4">
          {months > 1 ? `$${plan.totalPayToday} due today` : 'Lowest industry pricing'}
        </p>
      )}

      {months === 1 && (
        <p className="text-gray-500 text-xs mb-3 italic">
          $150 monthly savings locked in for life — reflected automatically at checkout
        </p>
      )}

      <div className="space-y-2 mb-5">
        {features.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-700">{f}</span>
          </div>
        ))}
      </div>

      {months === 1 && (
        <p className="text-[11px] text-gray-400 italic mb-4">No surprises. No step-ups. No dosage-based pricing.</p>
      )}

      {plan.isBestValue && (
        <>
          <p className="text-[11px] text-gray-400 italic mb-2">Lowest monthly cost · Highest success rate</p>
          <p className="text-amber-600 text-xs font-medium mb-4 flex items-center gap-1">
            <span>✨</span> Most patients choose this plan
          </p>
        </>
      )}

      <button
        onClick={() => handlePlanSelect(plan.id)}
        className={cn(
          'w-full py-3 rounded-full font-medium text-base transition-all duration-200',
          isSelected
            ? 'bg-green-500 text-white shadow-md'
            : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100',
        )}
      >
        Select{isSelected ? 'ed ✓' : ' +'}
      </button>
    </div>
  );
}
