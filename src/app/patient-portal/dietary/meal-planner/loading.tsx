export default function MealPlannerLoading() {
  return (
    <div className="min-h-[100dvh] animate-pulse px-4 py-6 pb-24">
      <div className="mb-6">
        <div className="mb-4 h-4 w-28 rounded bg-gray-200" />
        <div className="h-7 w-36 rounded-lg bg-gray-200" />
        <div className="mt-1 h-4 w-72 rounded bg-gray-100" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 w-28 rounded-xl bg-gray-100" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 rounded-2xl bg-white shadow-sm" />
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div className="h-72 rounded-2xl bg-gray-100" />
          <div className="h-48 rounded-2xl bg-white shadow-sm" />
          <div className="h-24 rounded-2xl bg-gray-50" />
        </div>
      </div>
    </div>
  );
}
