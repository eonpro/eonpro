export default function InjectionTrackerLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="h-7 w-44 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>
        {/* Status card */}
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="h-3 w-24 rounded bg-gray-100" />
            </div>
          </div>
        </div>
        {/* Body diagram placeholder */}
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mx-auto h-64 w-40 rounded-xl bg-gray-100" />
        </div>
        {/* History */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 h-5 w-28 rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between border-b border-gray-50 pb-3">
                <div className="space-y-1">
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-16 rounded bg-gray-100" />
                </div>
                <div className="h-6 w-16 rounded-full bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
