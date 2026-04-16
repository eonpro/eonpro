'use client';

/**
 * Generic skeleton loader for affiliate portal pages.
 * Shows a header bar + 3 content card placeholders with subtle pulse animation.
 */
export function AffiliatePageSkeleton({ title }: { title?: string }) {
  return (
    <div className="min-h-screen animate-pulse">
      <header className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          {title ? (
            <h1 className="text-xl font-semibold text-gray-300">{title}</h1>
          ) : (
            <div className="h-6 w-32 rounded bg-gray-200" />
          )}
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
        <div className="h-40 rounded-2xl bg-gray-100" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 rounded-2xl bg-gray-100" />
          <div className="h-24 rounded-2xl bg-gray-100" />
        </div>
        <div className="h-48 rounded-2xl bg-gray-100" />
      </div>
    </div>
  );
}
