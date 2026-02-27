export default function AdminOrdersLoading() {
  return (
    <div className="animate-pulse p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-8 w-40 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-200" />
        </div>
        <div className="h-10 w-32 rounded-lg bg-gray-200" />
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div className="h-10 w-72 rounded-lg bg-gray-200" />
        <div className="h-10 w-40 rounded-lg bg-gray-200" />
      </div>

      {/* Table header */}
      <div className="mb-2 grid grid-cols-7 gap-4 rounded-t-lg bg-gray-100 px-4 py-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-gray-200" />
        ))}
      </div>

      {/* Table rows */}
      <div className="divide-y divide-gray-100 rounded-b-lg border border-gray-100 bg-white">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-7 gap-4 px-4 py-4">
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-28 rounded bg-gray-200" />
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-6 w-20 rounded-full bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="flex gap-2">
          <div className="h-9 w-9 rounded bg-gray-200" />
          <div className="h-9 w-9 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
