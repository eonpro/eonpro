type StepNames = 'approval' | 'shipping' | 'payment';

const steps = [
  { id: 'quiz' as const, label: 'Quiz' },
  { id: 'shipping' as const, label: 'Shipping' },
  { id: 'payment' as const, label: 'Payment' },
];

function getStepState(
  stepId: 'quiz' | 'shipping' | 'payment',
  currentStep: StepNames
): 'completed' | 'active' | 'pending' {
  if (stepId === 'quiz') return 'completed';
  if (stepId === 'shipping') {
    if (currentStep === 'shipping') return 'active';
    if (currentStep === 'approval' || currentStep === 'payment') return 'completed';
    return 'pending';
  }
  // payment step — active when on approval (treatment selection) or payment
  if (currentStep === 'approval' || currentStep === 'payment') return 'active';
  return 'pending';
}

const CheckoutProgressHeader = ({ currentStep }: { currentStep: StepNames }) => {
  return (
    <nav
      role="navigation"
      aria-label="Checkout progress"
      className="flex w-full items-center justify-center gap-2 py-5 sm:gap-4"
    >
      {steps.map((step, i) => {
        const state = getStepState(step.id, currentStep);
        return (
          <div key={step.id} className="flex items-center gap-2 sm:gap-4">
            {i > 0 && (
              <div
                className={`h-[2px] w-8 rounded-full sm:w-16 ${
                  state === 'pending' ? 'bg-gray-300' : 'bg-gray-400'
                }`}
                aria-hidden="true"
              />
            )}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                  state === 'completed'
                    ? 'bg-[#0C2631]'
                    : state === 'active'
                      ? 'border-2 border-[#0C2631] bg-white'
                      : 'border-2 border-gray-300 bg-white'
                }`}
                aria-hidden="true"
              >
                {state === 'completed' ? (
                  <svg
                    className="h-3.5 w-3.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : state === 'active' ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-[#0C2631]" />
                ) : null}
              </div>
              <span
                className={`text-sm font-medium ${
                  state === 'pending' ? 'text-gray-400' : ''
                }`}
                style={state !== 'pending' ? { color: '#101010' } : undefined}
                {...(state === 'active' ? { 'aria-current': 'step' as const } : {})}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
};

export default CheckoutProgressHeader;
