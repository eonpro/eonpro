export default function PackagePhotosLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Header skeleton */}
        <div className="mb-6 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200" />
          <div>
            <div className="mb-1.5 h-6 w-40 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-64 animate-pulse rounded bg-gray-200" />
          </div>
        </div>

        {/* Tabs skeleton */}
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
          <div className="h-10 flex-1 animate-pulse rounded-md bg-gray-200" />
          <div className="h-10 flex-1 animate-pulse rounded-md bg-gray-200" />
        </div>

        {/* Content skeleton */}
        <div className="mx-auto max-w-lg">
          <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col items-center">
              <div className="mb-3 h-14 w-14 rounded-full bg-gray-200" />
              <div className="mb-2 h-5 w-32 rounded bg-gray-200" />
              <div className="h-4 w-56 rounded bg-gray-200" />
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 h-4 w-20 rounded bg-gray-200" />
                <div className="h-12 w-full rounded-lg bg-gray-200" />
              </div>
              <div>
                <div className="mb-1.5 h-4 w-16 rounded bg-gray-200" />
                <div className="h-10 w-full rounded-lg bg-gray-200" />
              </div>
              <div className="h-12 w-full rounded-lg bg-gray-200" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
