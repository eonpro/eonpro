export default function AdminSettingsLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="h-7 w-32 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>

        <div className="flex gap-6">
          <div className="w-64 flex-shrink-0 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-3">
                <div className="h-5 w-5 rounded bg-gray-200" />
                <div className={`h-4 rounded bg-gray-200 ${i % 2 === 0 ? 'w-24' : 'w-28'}`} />
              </div>
            ))}
          </div>

          <div className="min-h-[600px] flex-1 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 h-6 w-40 rounded bg-gray-200" />
            <div className="space-y-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="h-4 w-28 rounded bg-gray-200" />
                  <div className="h-10 w-full rounded-lg bg-gray-100" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="h-10 w-full rounded-lg bg-gray-100" />
                </div>
                <div className="space-y-3">
                  <div className="h-4 w-20 rounded bg-gray-200" />
                  <div className="h-10 w-full rounded-lg bg-gray-100" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
