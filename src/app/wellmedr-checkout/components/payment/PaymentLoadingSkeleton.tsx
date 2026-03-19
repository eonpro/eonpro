'use client';

export default function PaymentLoadingSkeleton() {
  return (
    <div className="w-full flex flex-col gap-6 sm:gap-8">
      <h3 className="text-center">Payment method</h3>

      <div className="flex flex-col gap-4 sm:gap-6 card">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-6 w-10 bg-gray-200 rounded animate-pulse" />
            <div className="h-6 w-10 bg-gray-200 rounded animate-pulse" />
            <div className="h-6 w-10 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Payment Element skeleton */}
        <div className="flex flex-col gap-4">
          <div className="h-12 w-full bg-gray-200 rounded-smooth animate-pulse" />
          <div className="h-12 w-full bg-gray-200 rounded-smooth animate-pulse" />
          <div className="flex gap-4">
            <div className="h-12 flex-1 bg-gray-200 rounded-smooth animate-pulse" />
            <div className="h-12 flex-1 bg-gray-200 rounded-smooth animate-pulse" />
          </div>
        </div>

        {/* Button skeleton */}
        <div className="h-14 w-full bg-gray-200 rounded-smooth animate-pulse" />

        {/* Footer skeleton */}
        <div className="h-4 w-48 mx-auto bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Loading message */}
      <p className="text-center text-sm opacity-50">
        Initializing secure payment...
      </p>
    </div>
  );
}
