'use client';

import { Users, Calendar, FileText, Pill } from 'lucide-react';

export function ProviderDashboardSkeleton() {
  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-8 h-32 animate-pulse rounded-2xl bg-gray-200" />
      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-4">
        {[Users, Calendar, FileText, Pill].map((Icon, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
            <Icon className="mb-3 h-8 w-8 text-gray-300" />
            <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
            <div className="mt-1 h-4 w-24 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
        <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    </div>
  );
}
