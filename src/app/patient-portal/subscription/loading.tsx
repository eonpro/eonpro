export default function SubscriptionLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="h-7 w-40 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-56 rounded bg-gray-100" />
        </div>
        {/* Plan card */}
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-5 w-32 rounded bg-gray-200" />
              <div className="h-4 w-24 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-20 rounded-full bg-gray-200" />
          </div>
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-6 w-20 rounded bg-gray-200" />
            </div>
          </div>
        </div>
        {/* Payment method */}
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-3 h-5 w-36 rounded bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-12 rounded bg-gray-200" />
            <div className="h-4 w-32 rounded bg-gray-100" />
          </div>
        </div>
        {/* Invoices */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 h-5 w-32 rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between border-b border-gray-50 pb-3">
                <div className="space-y-1">
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-16 rounded bg-gray-100" />
                </div>
                <div className="h-4 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
