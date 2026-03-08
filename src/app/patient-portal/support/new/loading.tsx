export default function NewSupportLoading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-gray-200" />
        <div>
          <div className="h-7 w-56 rounded-lg bg-gray-200" />
          <div className="mt-1 h-4 w-72 rounded bg-gray-100" />
        </div>
      </div>
      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <div className="mb-1.5 h-4 w-20 rounded bg-gray-200" />
          <div className="h-10 w-full rounded-xl bg-gray-100" />
        </div>
        <div>
          <div className="mb-1.5 h-4 w-16 rounded bg-gray-200" />
          <div className="h-10 w-full rounded-xl bg-gray-100" />
        </div>
        <div>
          <div className="mb-1.5 h-4 w-24 rounded bg-gray-200" />
          <div className="h-36 w-full rounded-xl bg-gray-100" />
        </div>
        <div className="flex justify-end gap-3">
          <div className="h-10 w-20 rounded-xl bg-gray-100" />
          <div className="h-10 w-36 rounded-xl bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
