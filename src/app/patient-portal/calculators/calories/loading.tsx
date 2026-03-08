export default function CaloriesLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <div className="mb-2 h-4 w-32 rounded bg-gray-200" />
        <div className="h-7 w-48 rounded-lg bg-gray-200" />
        <div className="mt-1 h-4 w-72 rounded bg-gray-100" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="h-80 rounded-2xl bg-white shadow-sm" />
          <div className="h-72 rounded-2xl bg-white shadow-sm" />
          <div className="h-40 rounded-2xl bg-white shadow-sm" />
        </div>
        <div className="space-y-6">
          <div className="h-48 rounded-2xl bg-gray-100" />
          <div className="h-40 rounded-2xl bg-white shadow-sm" />
          <div className="h-32 rounded-2xl bg-blue-50" />
        </div>
      </div>
    </div>
  );
}
