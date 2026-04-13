type StepNames = 'approval' | 'shipping' | 'payment';

const CheckoutProgressHeader = ({ currentStep }: { currentStep: StepNames }) => {
  const isCheckoutPhase = currentStep === 'shipping' || currentStep === 'payment';

  return (
    <div className="w-full flex items-center justify-center py-4 gap-4 sm:gap-8">
      {/* Step 1: Select Product */}
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isCheckoutPhase ? 'bg-green-500' : 'bg-green-500'}`}>
          {isCheckoutPhase ? (
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          ) : (
            <div className="w-2 h-2 bg-white rounded-full" />
          )}
        </div>
        <span className="text-sm font-medium" style={{ color: '#101010' }}>Select Product</span>
      </div>

      {/* Line */}
      <div className={`w-16 sm:w-24 h-0.5 rounded-full ${isCheckoutPhase ? 'bg-green-500' : 'bg-gray-300'}`} />

      {/* Step 2: Checkout */}
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${isCheckoutPhase ? 'border-green-500 bg-green-500' : 'border-gray-300 bg-white'}`}>
          {isCheckoutPhase && <div className="w-2 h-2 bg-white rounded-full" />}
        </div>
        <span className={`text-sm font-medium ${isCheckoutPhase ? '' : 'text-gray-400'}`} style={isCheckoutPhase ? { color: '#101010' } : undefined}>Checkout</span>
      </div>
    </div>
  );
};

export default CheckoutProgressHeader;
