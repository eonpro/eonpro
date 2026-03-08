export default function PatientDetailLoading() {
  return (
    <div className="min-h-screen bg-[#efece7] p-6">
      <div className="flex gap-6">
        {/* Left Sidebar Skeleton */}
        <div className="w-[320px] flex-shrink-0 animate-pulse space-y-4">
          {/* Patient avatar + name */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-100" />
              </div>
            </div>
            {/* Contact info */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <div className="h-3 w-48 rounded bg-gray-100" />
              <div className="h-3 w-40 rounded bg-gray-100" />
              <div className="h-3 w-36 rounded bg-gray-100" />
              <div className="h-3 w-44 rounded bg-gray-100" />
            </div>
          </div>
          {/* Nav tabs */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                  <div className="h-4 w-4 rounded bg-gray-200" />
                  <div className="h-4 rounded bg-gray-100" style={{ width: `${60 + (i * 11) % 40}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div className="min-w-0 flex-1 animate-pulse space-y-4">
          {/* Search bar */}
          <div className="h-11 w-full rounded-xl border border-gray-200 bg-white" />

          {/* Page title */}
          <div className="h-7 w-48 rounded bg-gray-200" />

          {/* Portal access block */}
          <div className="h-14 rounded-2xl border border-gray-200 bg-white" />

          {/* Vitals grid */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-4 h-5 w-16 rounded bg-gray-200" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-[#efece7] p-4">
                  <div className="mb-2 h-3 w-16 rounded bg-gray-300/60" />
                  <div className="h-7 w-12 rounded bg-gray-300/60" />
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-300">
                    <div className="h-full w-0 rounded-full bg-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prescription summary */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-4 h-5 w-48 rounded bg-gray-200" />
            <div className="space-y-3">
              <div className="h-12 rounded-xl bg-gray-100" />
              <div className="h-12 rounded-xl bg-gray-100" />
            </div>
          </div>

          {/* Tags + Overview */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex gap-2">
              <div className="h-6 w-16 rounded-full bg-gray-200" />
              <div className="h-6 w-20 rounded-full bg-gray-200" />
              <div className="h-6 w-14 rounded-full bg-gray-200" />
            </div>
            <div className="space-y-2">
              <div className="h-5 w-24 rounded bg-gray-200" />
              <div className="h-3 w-40 rounded bg-gray-100" />
              <div className="h-3 w-36 rounded bg-gray-100" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
