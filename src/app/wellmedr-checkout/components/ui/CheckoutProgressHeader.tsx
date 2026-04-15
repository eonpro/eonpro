type StepNames = 'approval' | 'shipping' | 'payment';

const CheckoutProgressHeader = ({ currentStep }: { currentStep: StepNames }) => {
  const isCheckoutPhase = currentStep === 'shipping' || currentStep === 'payment';

  return (
    <div className="flex w-full items-center justify-center gap-4 py-4 sm:gap-8">
      {/* Step 1: Select Product */}
      <div className="flex items-center gap-2">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full ${isCheckoutPhase ? 'bg-green-500' : 'border-2 border-green-500 bg-white'}`}
        >
          {isCheckoutPhase ? (
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
          ) : (
            <div className="h-2 w-2 rounded-full bg-white" />
          )}
        </div>
        <span className="text-sm font-medium" style={{ color: '#101010' }}>
          Select Product
        </span>
      </div>

      {/* Line */}
      <div
        className={`h-0.5 w-16 rounded-full sm:w-24 ${isCheckoutPhase ? 'bg-green-500' : 'bg-gray-300'}`}
      />

      {/* Step 2: Checkout */}
      <div className="flex items-center gap-2">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${isCheckoutPhase ? 'border-green-500 bg-green-500' : 'border-gray-300 bg-white'}`}
        >
          {isCheckoutPhase && <div className="h-2 w-2 rounded-full bg-white" />}
        </div>
        <span
          className={`text-sm font-medium ${isCheckoutPhase ? '' : 'text-gray-400'}`}
          style={isCheckoutPhase ? { color: '#101010' } : undefined}
        >
          Checkout
        </span>
      </div>
    </div>
  );
};

export default CheckoutProgressHeader;
