import cn from '@/app/wellmedr-checkout/lib/cn';

type StepNames = 'approval' | 'shipping' | 'payment';

const CheckoutProgressHeader = ({
  currentStep,
}: {
  currentStep: StepNames;
}) => {
  const getStepStatus = (step: StepNames) => {
    const stepOrder: StepNames[] = ['approval', 'shipping', 'payment'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(step);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  const getBorderStatus = (stepName: StepNames) => {
    const stepOrder: StepNames[] = ['approval', 'shipping', 'payment'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepName);

    return stepIndex < currentIndex;
  };

  const StepItem = ({
    stepName,
    status,
  }: {
    stepName: StepNames;
    status: 'completed' | 'current' | 'upcoming';
  }) => {
    return (
      <div className="flex gap-2 sm:gap-2.5 items-center my-6">
        <div
          className={cn(
            'w-4 h-4 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border transition-all duration-200',
            status === 'completed' ? 'bg-primary border-primary' : '',
            status === 'current' ? 'border-primary bg-white' : '',
            status === 'upcoming' ? 'border-border bg-white' : '',
          )}
        >
          {status === 'completed' && (
            <svg
              className="w-2 h-2 sm:w-4 sm:h-4 text-white"
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
          )}
          {status === 'current' && (
            <div className="w-2 h-2 sm:w-3 sm:h-3 bg-primary rounded-full" />
          )}
        </div>
        <span
          className={cn(
            'label capitalize text-xs sm:text-xl transition-colors duration-200',
            status === 'completed' || status === 'current'
              ? 'text-foreground'
              : 'text-[#D6D6D6]',
          )}
        >
          {stepName}
        </span>
      </div>
    );
  };

  const Border = ({ isActive }: { isActive: boolean }) => {
    return (
      <div
        className={`flex-1 w-6 sm:w-16 rounded-smooth h-0.5 transition-colors duration-200 ${
          isActive ? 'bg-primary' : 'bg-gray-300'
        }`}
      />
    );
  };

  return (
    <div className="relative w-full flex items-center justify-center">
      <div className="flex items-center gap-2 sm:gap-6">
        <StepItem stepName="approval" status={getStepStatus('approval')} />
        <Border isActive={getBorderStatus('approval')} />
        <StepItem stepName="shipping" status={getStepStatus('shipping')} />
        <Border isActive={getBorderStatus('shipping')} />
        <StepItem stepName="payment" status={getStepStatus('payment')} />
      </div>

      {/* Placeholder div */}
      <div aria-hidden />
    </div>
  );
};

export default CheckoutProgressHeader;
