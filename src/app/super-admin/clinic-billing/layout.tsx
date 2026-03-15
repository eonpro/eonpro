'use client';

import { usePathname } from 'next/navigation';
import { Building2, BarChart3, Receipt, FileText, ScrollText } from 'lucide-react';

const billingTabs = [
  { label: 'Overview', path: '/super-admin/clinic-billing', icon: Building2 },
  { label: 'Analytics', path: '/super-admin/clinic-billing/analytics', icon: BarChart3 },
  { label: 'Invoices', path: '/super-admin/clinic-billing/invoices', icon: Receipt },
  { label: 'Reports', path: '/super-admin/clinic-billing/reports', icon: FileText },
  { label: 'Statements', path: '/super-admin/clinic-billing/statements', icon: ScrollText },
] as const;

function isTabActive(tabPath: string, currentPath: string): boolean {
  if (tabPath === '/super-admin/clinic-billing') {
    return currentPath === tabPath;
  }
  return currentPath.startsWith(tabPath);
}

export default function ClinicBillingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const showTabs = billingTabs.some((t) => isTabActive(t.path, pathname));

  if (!showTabs) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinic Billing</h1>
          <p className="mt-1 text-gray-500">Configure platform fees and manage clinic invoices</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
        {billingTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab.path, pathname);
          return (
            <a
              key={tab.path}
              href={tab.path}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#4fa77e]/10 text-[#4fa77e]'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </a>
          );
        })}
      </div>

      {children}
    </div>
  );
}
