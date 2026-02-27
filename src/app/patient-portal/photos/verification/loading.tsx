export default function VerificationLoading() {
  return (
    <div className="min-h-[100dvh] animate-pulse px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-gray-200" />
        <div>
          <div className="h-7 w-40 rounded bg-gray-200" />
          <div className="mt-1 h-4 w-56 rounded bg-gray-200" />
        </div>
      </div>

      {/* Status card */}
      <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gray-200" />
          <div>
            <div className="h-5 w-32 rounded bg-gray-200" />
            <div className="mt-1 h-4 w-44 rounded bg-gray-200" />
          </div>
        </div>
      </div>

      {/* Document items */}
      <div className="space-y-3">
        {['ID Front', 'ID Back', 'Selfie'].map((label) => (
          <div key={label} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gray-200" />
              <div>
                <div className="h-5 w-24 rounded bg-gray-200" />
                <div className="mt-1 h-3 w-16 rounded bg-gray-200" />
              </div>
            </div>
            <div className="h-9 w-20 rounded-xl bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Info card */}
      <div className="mt-6 rounded-2xl bg-blue-50 p-5">
        <div className="mb-2 h-5 w-36 rounded bg-blue-100" />
        <div className="space-y-1">
          <div className="h-3 w-full rounded bg-blue-100" />
          <div className="h-3 w-4/5 rounded bg-blue-100" />
          <div className="h-3 w-3/5 rounded bg-blue-100" />
        </div>
      </div>
    </div>
  );
}
