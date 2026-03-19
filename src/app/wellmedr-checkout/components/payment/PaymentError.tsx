export default function PaymentError() {
  return (
    <div className="w-full flex flex-col gap-4 items-center justify-center p-8 bg-red-50 rounded-lg border border-red-200">
      <div className="text-red-600">
        <svg
          className="w-12 h-12 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-red-900">
        Payment System Unavailable
      </h3>
      <p className="text-center text-red-700 max-w-md">
        We're unable to process payments at this time. Please contact support or
        try again later.
      </p>
    </div>
  );
}
