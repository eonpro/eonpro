export default function SymptomCheckerLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="h-7 w-44 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>
        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gray-200" />
              {i < 2 && <div className="h-0.5 w-12 rounded bg-gray-100" />}
            </div>
          ))}
        </div>
        {/* Symptom selection grid */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 p-3">
                <div className="h-5 w-5 rounded bg-gray-200" />
                <div className="h-4 w-20 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
