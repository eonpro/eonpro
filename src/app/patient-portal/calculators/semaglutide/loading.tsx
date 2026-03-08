export default function SemaglutideCalculatorLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="h-7 w-52 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="space-y-5">
            <div><div className="mb-2 h-4 w-24 rounded bg-gray-200" /><div className="h-11 w-full rounded-xl bg-gray-100" /></div>
            <div><div className="mb-2 h-4 w-28 rounded bg-gray-200" /><div className="h-11 w-full rounded-xl bg-gray-100" /></div>
            <div className="h-12 w-full rounded-xl bg-gray-200" />
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
