export default function WelcomeKitLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <div className="h-7 w-36 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-56 rounded bg-gray-100" />
        </div>
        {/* Getting started card */}
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-4 h-6 w-40 rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
                <div className="h-4 w-full rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
        {/* Video section */}
        <div className="mb-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="p-5">
            <div className="h-6 w-44 rounded bg-gray-200" />
            <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
          </div>
          <div className="p-6 pt-0">
            <div className="aspect-video rounded-2xl bg-gray-200" />
          </div>
        </div>
        {/* Tips sections */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white shadow-sm" />
          ))}
        </div>
      </div>
    </div>
  );
}
