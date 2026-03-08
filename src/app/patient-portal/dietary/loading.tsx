export default function DietaryLoading() {
  return (
    <div className="min-h-[100dvh] animate-pulse">
      <div className="mx-auto max-w-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gray-200" />
          <div className="h-5 w-32 rounded bg-gray-200" />
        </div>
      </div>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <div className="h-56 rounded-2xl bg-gray-100" />
        <div className="h-96 rounded-2xl bg-white shadow-sm" />
        <div className="space-y-4">
          <div className="h-5 w-32 rounded bg-gray-200" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white shadow-sm" />
          ))}
        </div>
        <div className="h-36 rounded-xl bg-blue-50" />
      </div>
    </div>
  );
}
