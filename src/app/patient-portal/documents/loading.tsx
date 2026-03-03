export default function DocumentsLoading() {
  return (
    <div className="min-h-screen animate-pulse">
      {/* Header */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-5 w-5 rounded bg-gray-200" />
            <div className="h-6 w-36 rounded bg-gray-200" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Privacy notice */}
        <div className="mb-6 h-20 rounded-lg bg-blue-50" />

        {/* Upload section */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="mb-4 h-6 w-44 rounded bg-gray-200" />
          <div className="mb-4 h-10 w-48 rounded-lg bg-gray-100" />
          <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-gray-200">
            <div className="h-12 w-12 rounded bg-gray-200" />
          </div>
        </div>

        {/* Documents list */}
        <div className="rounded-lg bg-white shadow">
          <div className="border-b px-6 py-4">
            <div className="h-6 w-36 rounded bg-gray-200" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-gray-200" />
                  <div>
                    <div className="h-4 w-40 rounded bg-gray-200" />
                    <div className="mt-1 h-3 w-56 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-8 rounded bg-gray-100" />
                  <div className="h-8 w-8 rounded bg-gray-100" />
                  <div className="h-8 w-8 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
