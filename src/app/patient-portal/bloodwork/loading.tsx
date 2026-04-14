export default function BloodworkLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-36 rounded bg-gray-200" />
            <div className="mt-2 h-4 w-56 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-32 rounded-xl bg-gray-200" />
        </div>

        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-5 w-40 rounded bg-gray-200" />
                    <div className="h-3 w-28 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="h-5 w-5 rounded bg-gray-100" />
              </div>
              <div className="mt-4 flex items-center gap-6">
                <div className="h-3 w-24 rounded bg-gray-100" />
                <div className="h-3 w-20 rounded bg-gray-100" />
                <div className="h-5 w-20 rounded-full bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
