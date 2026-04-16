export default function PaymentError() {
  return (
    <div
      role="alert"
      className="flex w-full flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 p-8"
    >
      <div className="text-red-600">
        <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-red-900">Payment System Unavailable</h3>
      <p className="max-w-md text-center text-red-700">
        We're unable to process payments at this time. Please contact support or try again later.
      </p>
    </div>
  );
}
