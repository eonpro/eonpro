export default function PatientPortalLoading() {
  return (
    <div className="min-h-[100dvh] animate-pulse px-4 py-6">
      {/* Welcome header */}
      <div className="mb-6">
        <div className="h-4 w-28 rounded bg-gray-200" />
        <div className="mt-2 h-8 w-56 rounded bg-gray-200" />
      </div>

      {/* Vitals row */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-2 h-3 w-14 rounded bg-gray-200" />
            <div className="h-7 w-16 rounded bg-gray-200" />
            <div className="mt-2 h-2 w-full rounded-full bg-gray-100" />
          </div>
        ))}
      </div>

      {/* Weight progress hero card */}
      <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-5 w-32 rounded bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200" />
        </div>
        <div className="h-40 w-full rounded-xl bg-gray-100" />
      </div>

      {/* Quick stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-200" />
            </div>
            <div className="h-5 w-28 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Quick actions grid */}
      <div className="mb-6">
        <div className="mb-3 h-5 w-28 rounded bg-gray-200" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm">
              <div className="h-10 w-10 rounded-xl bg-gray-200" />
              <div className="h-3 w-14 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
