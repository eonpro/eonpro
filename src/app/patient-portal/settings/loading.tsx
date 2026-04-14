export default function SettingsLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="h-7 w-28 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-48 rounded bg-gray-100" />
        </div>
        {/* Avatar section */}
        <div className="mb-6 flex items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-gray-200" />
          <div className="space-y-2">
            <div className="h-5 w-32 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-100" />
          </div>
        </div>
        {/* Form sections */}
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 h-5 w-36 rounded bg-gray-200" />
              <div className="space-y-4">
                <div>
                  <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
                  <div className="h-11 w-full rounded-xl bg-gray-100" />
                </div>
                <div>
                  <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
                  <div className="h-11 w-full rounded-xl bg-gray-100" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
