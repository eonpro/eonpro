export default function SalesRepDetailLoading() {
  return (
    <div className="animate-pulse p-6">
      {/* Back button */}
      <div className="mb-4 h-5 w-36 rounded bg-gray-200" />

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-40 rounded bg-gray-200" />
            <div className="h-5 w-16 rounded-full bg-gray-200" />
          </div>
          <div className="mt-2 flex gap-4">
            <div className="h-4 w-28 rounded bg-gray-100" />
            <div className="h-4 w-36 rounded bg-gray-100" />
            <div className="h-4 w-24 rounded bg-gray-100" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-9 rounded-lg bg-gray-200" />
          <div className="h-9 w-28 rounded-lg bg-gray-200" />
        </div>
      </div>

      {/* Period filter */}
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 h-4 w-16 rounded bg-gray-200" />
        <div className="h-9 w-40 rounded-lg bg-gray-200" />
      </div>

      {/* Stats cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
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

      {/* Chart + Code performance */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 h-6 w-36 rounded bg-gray-200" />
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-14 rounded bg-gray-100" />
                <div className="h-4 flex-1 rounded bg-gray-200" style={{ width: `${70 - i * 5}%` }} />
                <div className="h-3 w-10 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 h-6 w-40 rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-gray-100 p-3">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="mt-2 h-3 w-32 rounded bg-gray-100" />
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
