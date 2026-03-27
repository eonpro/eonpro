export default function SymptomCheckerLoading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 pb-24 pt-2 md:px-6">
      {/* Hero Card Skeleton */}
      <div className="mb-6 rounded-3xl bg-gray-200 p-6 sm:p-8">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-gray-300" />
          <div className="h-4 w-36 rounded bg-gray-300" />
        </div>
        <div className="h-8 w-56 rounded bg-gray-300" />
        <div className="mt-3 h-4 w-full rounded bg-gray-300" />
        <div className="mt-2 h-4 w-3/4 rounded bg-gray-300" />
      </div>

      {/* How It Works Skeleton */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 h-3 w-28 rounded bg-gray-200" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-gray-100" />
              <div className="flex-1">
                <div className="h-4 w-40 rounded bg-gray-200" />
                <div className="mt-1 h-3 w-56 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer Skeleton */}
      <div className="mb-6 rounded-2xl bg-amber-50/50 p-4">
        <div className="flex gap-3">
          <div className="h-5 w-5 shrink-0 rounded bg-amber-200" />
          <div className="flex-1">
            <div className="h-4 w-32 rounded bg-amber-200" />
            <div className="mt-1 h-3 w-full rounded bg-amber-100" />
          </div>
        </div>
      </div>

      {/* CTA Button Skeleton */}
      <div className="h-14 w-full rounded-2xl bg-gray-200" />
    </div>
  );
}
