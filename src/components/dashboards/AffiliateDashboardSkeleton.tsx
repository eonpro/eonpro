'use client';

export function AffiliateDashboardSkeleton() {
  return (
    <div className="min-h-screen">
      <header className="px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-1 h-4 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
        <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    </div>
  );
}
