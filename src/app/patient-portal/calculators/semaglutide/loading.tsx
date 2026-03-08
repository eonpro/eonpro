export default function SemaglutideLoading() {
  return (
    <div className="min-h-[100dvh] animate-pulse px-4 py-6">
      <div className="mb-8">
        <div className="mb-4 h-4 w-24 rounded bg-gray-200" />
        <div className="h-8 w-48 rounded-lg bg-gray-200" />
        <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4 h-6 w-40 rounded bg-gray-200" />
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-gray-100" />
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
            <div className="h-16 rounded-2xl bg-gray-100" />
            <div className="mx-auto mt-8 h-64 w-16 rounded-xl bg-gray-100" />
          </div>
        </div>
        <div className="space-y-6">
          <div className="h-64 rounded-3xl bg-gray-100" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-3xl bg-white shadow-sm" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
