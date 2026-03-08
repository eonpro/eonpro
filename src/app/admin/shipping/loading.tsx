export default function ShippingLoading() {
  return (
    <div className="min-h-screen animate-pulse p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-7 w-32 rounded bg-gray-200" />
          <div className="flex gap-3">
            <div className="h-10 w-40 rounded-lg bg-gray-100" />
            <div className="h-10 w-28 rounded-lg bg-gray-200" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="flex-1" />
                <div className="h-6 w-20 rounded-full bg-gray-200" />
                <div className="h-4 w-28 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
