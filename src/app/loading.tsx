export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center">
        {/* Logo Animation */}
        <div className="mb-8">
          <div className="relative mx-auto h-20 w-20">
            {/* Spinning ring */}
            <div className="absolute inset-0 rounded-full border-4 border-emerald-200" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-emerald-600" />

            {/* Logo in center */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="h-10 w-10 animate-pulse rounded bg-emerald-500 flex-shrink-0"
                aria-hidden
              />
            </div>
          </div>
        </div>

        {/* Loading Text */}
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Loading...</h2>
        <p className="text-sm text-gray-500">Please wait while we load your content</p>

        {/* Loading Skeleton Preview */}
        <div className="mx-auto mt-8 max-w-sm space-y-3">
          <div className="mx-auto h-4 w-3/4 animate-pulse rounded-full bg-gray-200" />
          <div className="mx-auto h-4 w-1/2 animate-pulse rounded-full bg-gray-200" />
          <div className="mx-auto h-4 w-2/3 animate-pulse rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
