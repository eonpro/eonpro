export default function ShipmentsLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-gray-200" />
          <div>
            <div className="h-7 w-48 rounded bg-gray-200" />
            <div className="mt-1.5 h-4 w-64 rounded bg-gray-100" />
          </div>
        </div>
        <div className="h-10 w-24 rounded-xl bg-gray-200" />
      </div>

      {/* Shipment cards */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gray-200" />
                  <div>
                    <div className="h-5 w-24 rounded bg-gray-200" />
                    <div className="mt-1 h-4 w-40 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="h-9 w-16 rounded-lg bg-gray-200" />
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="space-y-2">
                <div className="h-4 w-48 rounded bg-gray-100" />
                <div className="h-4 w-36 rounded bg-gray-100" />
              </div>
              <div className="mt-3 h-3 w-32 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
