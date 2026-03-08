export default function VerificationQueueLoading() {
  return (
    <div className="min-h-screen animate-pulse p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <div className="h-7 w-44 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="h-4 w-16 rounded bg-gray-200" />
              <div className="mt-2 h-8 w-12 rounded bg-gray-200" />
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="h-16 w-16 rounded-lg bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-48 rounded bg-gray-100" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-20 rounded-lg bg-gray-200" />
                  <div className="h-8 w-20 rounded-lg bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
