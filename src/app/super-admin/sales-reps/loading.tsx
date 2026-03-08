export default function SalesRepsLoading() {
  return (
    <div className="animate-pulse p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
          </div>
          <div className="h-8 w-32 rounded bg-gray-200" />
          <div className="mt-1 h-4 w-56 rounded bg-gray-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-lg bg-gray-200" />
          <div className="h-9 w-28 rounded-lg bg-gray-200" />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 h-4 w-28 rounded bg-gray-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="mb-1 h-3 w-16 rounded bg-gray-100" />
              <div className="h-9 w-full rounded-lg bg-gray-200" />
            </div>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gray-200" />
              <div>
                <div className="h-7 w-14 rounded bg-gray-200" />
                <div className="mt-1 h-3 w-16 rounded bg-gray-100" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-4 w-16 rounded bg-gray-200" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-6 border-b border-gray-100 px-4 py-3.5"
          >
            <div className="h-4 w-6 rounded bg-gray-100" />
            <div className="h-4 w-28 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-5 w-14 rounded-full bg-gray-200" />
            <div className="h-4 w-12 rounded bg-gray-100" />
            <div className="h-4 w-10 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
