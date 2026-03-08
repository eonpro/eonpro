export default function TutorialsLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <div className="h-7 w-32 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-56 rounded bg-gray-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="aspect-video w-full rounded-t-2xl bg-gray-200" />
            <div className="space-y-2 p-4">
              <div className="h-5 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-full rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
