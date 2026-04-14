export default function SupportLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-32 rounded bg-gray-200" />
            <div className="mt-2 h-4 w-56 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-32 rounded-xl bg-gray-200" />
        </div>

        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-20 rounded-full bg-gray-200" />
                    <div className="h-4 w-24 rounded bg-gray-100" />
                  </div>
                  <div className="h-5 w-64 rounded bg-gray-200" />
                  <div className="flex items-center gap-4">
                    <div className="h-3 w-28 rounded bg-gray-100" />
                    <div className="h-3 w-20 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="h-5 w-5 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
