export default function CalculatorsLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <div className="h-7 w-40 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gray-200" />
              <div className="h-5 w-28 rounded bg-gray-200" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-gray-100" />
              <div className="h-3 w-3/4 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
