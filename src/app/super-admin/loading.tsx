export default function SuperAdminLoading() {
  return (
    <div className="min-h-screen animate-pulse p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="h-8 w-52 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-80 rounded bg-gray-100" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="h-4 w-28 rounded bg-gray-200" />
              <div className="mt-3 h-8 w-20 rounded bg-gray-200" />
              <div className="mt-2 h-3 w-36 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-4 flex-1 rounded bg-gray-100" />
                <div className="h-6 w-20 rounded-full bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
