export default function ProviderLoading() {
  return (
    <div className="min-h-screen animate-pulse p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="h-8 w-56 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="flex gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 w-28 rounded-lg bg-gray-200" />
              ))}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="h-4 w-20 rounded bg-gray-200" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-36 rounded bg-gray-200" />
                  <div className="h-3 w-48 rounded bg-gray-100" />
                </div>
                <div className="h-6 w-24 rounded-full bg-gray-200" />
                <div className="h-8 w-20 rounded-lg bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
