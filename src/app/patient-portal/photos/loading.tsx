export default function PhotosLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="h-7 w-28 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-48 rounded bg-gray-100" />
        </div>
        {/* Category cards */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="h-10 w-10 rounded-xl bg-gray-200" />
              <div className="mt-3 h-5 w-20 rounded bg-gray-200" />
              <div className="mt-1 h-3 w-28 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        {/* Recent photos grid */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 h-5 w-32 rounded bg-gray-200" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
