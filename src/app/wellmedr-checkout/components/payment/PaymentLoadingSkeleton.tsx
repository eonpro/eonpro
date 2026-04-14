'use client';

export default function PaymentLoadingSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6 sm:gap-8">
      <h3 className="text-center">Payment method</h3>

      <div className="card flex flex-col gap-4 sm:gap-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
          <div className="flex gap-2">
            <div className="h-6 w-10 animate-pulse rounded bg-gray-200" />
            <div className="h-6 w-10 animate-pulse rounded bg-gray-200" />
            <div className="h-6 w-10 animate-pulse rounded bg-gray-200" />
          </div>
        </div>

        {/* Payment Element skeleton */}
        <div className="flex flex-col gap-4">
          <div className="rounded-smooth h-12 w-full animate-pulse bg-gray-200" />
          <div className="rounded-smooth h-12 w-full animate-pulse bg-gray-200" />
          <div className="flex gap-4">
            <div className="rounded-smooth h-12 flex-1 animate-pulse bg-gray-200" />
            <div className="rounded-smooth h-12 flex-1 animate-pulse bg-gray-200" />
          </div>
        </div>

        {/* Button skeleton */}
        <div className="rounded-smooth h-14 w-full animate-pulse bg-gray-200" />

        {/* Footer skeleton */}
        <div className="mx-auto h-4 w-48 animate-pulse rounded bg-gray-200" />
      </div>

      {/* Loading message */}
      <p className="text-center text-sm opacity-50">Initializing secure payment...</p>
    </div>
  );
}
