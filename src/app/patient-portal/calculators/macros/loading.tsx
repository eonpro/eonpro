export default function MacrosCalculatorLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="h-7 w-44 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="space-y-5">
            <div>
              <div className="mb-2 h-4 w-16 rounded bg-gray-200" />
              <div className="h-11 w-full rounded-xl bg-gray-100" />
            </div>
            <div>
              <div className="mb-2 h-4 w-16 rounded bg-gray-200" />
              <div className="h-11 w-full rounded-xl bg-gray-100" />
            </div>
            <div>
              <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
              <div className="h-11 w-full rounded-xl bg-gray-100" />
            </div>
            <div className="h-12 w-full rounded-xl bg-gray-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
