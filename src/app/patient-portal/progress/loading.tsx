export default function ProgressLoading() {
  return (
    <div className="min-h-[100dvh] animate-pulse px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-56 rounded bg-gray-200" />
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 w-24 flex-shrink-0 rounded-xl bg-gray-200" />
        ))}
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-2 h-4 w-16 rounded bg-gray-200" />
            <div className="h-7 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 h-5 w-32 rounded bg-gray-200" />
        <div className="h-48 w-full rounded-xl bg-gray-100" />
      </div>

      {/* Log entry form placeholder */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 h-5 w-28 rounded bg-gray-200" />
        <div className="mb-3 h-12 w-full rounded-xl bg-gray-100" />
        <div className="h-10 w-full rounded-xl bg-gray-200" />
      </div>
    </div>
  );
}
