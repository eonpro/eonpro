export default function SettingsLoading() {
  return (
    <div className="min-h-screen animate-pulse p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <div className="h-8 w-32 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-56 rounded bg-gray-100" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="flex gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 w-24 rounded-lg bg-gray-200" />
              ))}
            </div>
          </div>
          <div className="space-y-6 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="h-10 w-full rounded-lg bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
