export default function DocumentsLoading() {
  return (
    <div className="min-h-[100dvh] animate-pulse px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gray-200" />
          <div className="h-7 w-36 rounded bg-gray-200" />
        </div>
      </div>

      {/* Upload area */}
      <div className="mb-6 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-gray-200" />
          <div className="h-4 w-48 rounded bg-gray-200" />
          <div className="h-3 w-32 rounded bg-gray-200" />
        </div>
      </div>

      {/* Category filter */}
      <div className="mb-4 h-10 w-48 rounded-lg bg-gray-200" />

      {/* Document list */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-200" />
              <div>
                <div className="h-5 w-40 rounded bg-gray-200" />
                <div className="mt-1 h-3 w-24 rounded bg-gray-200" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-8 rounded-lg bg-gray-200" />
              <div className="h-8 w-8 rounded-lg bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
