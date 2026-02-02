'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Wallet,
  RefreshCcw,
  FileText,
  PieChart,
  FileBarChart,
  Settings,
  UserPlus,
} from 'lucide-react';

const financeNavItems = [
  { icon: LayoutDashboard, path: '/admin/finance', label: 'Overview', exact: true },
  { icon: TrendingUp, path: '/admin/finance/revenue', label: 'Revenue' },
  { icon: Users, path: '/admin/finance/patients', label: 'Patients' },
  { icon: Wallet, path: '/admin/finance/payouts', label: 'Payouts' },
  { icon: RefreshCcw, path: '/admin/finance/reconciliation', label: 'Reconciliation' },
  { icon: FileText, path: '/admin/finance/invoices', label: 'Invoices' },
  { icon: PieChart, path: '/admin/finance/subscriptions', label: 'Subscriptions' },
  { icon: UserPlus, path: '/admin/finance/pending-profiles', label: 'Pending Profiles' },
  { icon: FileBarChart, path: '/admin/finance/reports', label: 'Reports' },
  { icon: Settings, path: '/admin/finance/settings', label: 'Settings' },
];

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return pathname === path;
    return pathname === path || pathname?.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen bg-[#efece7]">
      {/* Finance Header */}
      <div className="border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Financial Hub</h1>
              <p className="text-sm text-gray-500">Comprehensive financial analytics and management</p>
            </div>
          </div>
        </div>
        
        {/* Finance Navigation Tabs */}
        <div className="px-6">
          <nav className="flex gap-1 overflow-x-auto scrollbar-hide pb-px">
            {financeNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path, item.exact);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    active
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="p-6">
        {children}
      </main>
    </div>
  );
}
