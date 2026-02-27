export default function ShipmentsLoading() {
  return (
    <div className="min-h-[100dvh] animate-pulse px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-gray-200" />
        <div className="h-7 w-36 rounded bg-gray-200" />
        <div className="ml-auto h-8 w-8 rounded-lg bg-gray-200" />
      </div>

      {/* Shipment cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mb-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gray-200" />
              <div>
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="mt-1 h-3 w-24 rounded bg-gray-200" />
              </div>
            </div>
            <div className="h-6 w-20 rounded-full bg-gray-200" />
          </div>
          <div className="mb-3 h-px bg-gray-100" />
          <div className="flex items-center justify-between">
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
