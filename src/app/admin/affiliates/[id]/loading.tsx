export default function AffiliateDetailLoading() {
  return (
    <div className="animate-pulse p-6">
      {/* Back button + header */}
      <div className="mb-6">
        <div className="mb-4 h-4 w-20 rounded bg-gray-200" />
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-200" />
          <div>
            <div className="h-7 w-48 rounded bg-gray-200" />
            <div className="mt-2 h-4 w-32 rounded bg-gray-200" />
          </div>
          <div className="ml-auto h-6 w-20 rounded-full bg-gray-200" />
        </div>
      </div>

      {/* Stats grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2 h-4 w-16 rounded bg-gray-200" />
            <div className="h-7 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Landing Page URLs */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 h-6 w-40 rounded bg-gray-200" />
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-12 w-full rounded-lg bg-gray-100" />
              ))}
            </div>
          </div>

          {/* Attributed Patients */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 h-6 w-44 rounded bg-gray-200" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                  <div className="h-10 w-10 rounded-full bg-gray-200" />
                  <div className="h-4 w-40 rounded bg-gray-200" />
                  <div className="ml-auto h-4 w-20 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 h-5 w-20 rounded bg-gray-200" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-gray-200" />
                  <div className="h-4 w-36 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
          <div className="h-32 rounded-xl border border-gray-100 bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}
