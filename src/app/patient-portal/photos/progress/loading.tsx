export default function PhotosProgressLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-gray-200" />
          <div>
            <div className="h-7 w-40 rounded bg-gray-200" />
            <div className="mt-1.5 h-4 w-56 rounded bg-gray-100" />
          </div>
        </div>
        <div className="h-10 w-28 rounded-xl bg-gray-200" />
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-2 h-3 w-16 rounded bg-gray-200" />
            <div className="h-6 w-12 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Photo grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-2xl bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
