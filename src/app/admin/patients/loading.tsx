export default function AdminPatientsLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="h-7 w-28 rounded bg-gray-200" />
            <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-32 rounded-lg bg-gray-200" />
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="h-10 flex-1 rounded-lg bg-gray-100" />
            <div className="h-10 w-40 rounded-lg bg-gray-100" />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="bg-gray-50 px-6 py-3">
            <div className="flex gap-6">
              <div className="h-4 w-20 rounded bg-gray-200" />
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-4 w-16 rounded bg-gray-200" />
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-4 w-16 rounded bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-200" />
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-6 py-4">
                <div className="h-10 w-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 rounded bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-100" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-28 rounded bg-gray-100" />
                </div>
                <div className="h-3 w-24 rounded bg-gray-200" />
                <div className="h-5 w-16 rounded-full bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-200" />
                <div className="flex gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gray-100" />
                  <div className="h-8 w-8 rounded-lg bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
