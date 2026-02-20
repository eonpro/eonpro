'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import type { LayoutUser } from '@/types/common';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Users,
  ShoppingCart,
  Store,
  TrendingUp,
  DollarSign,
  FileText,
  Settings,
  LogOut,
  ChevronRight,
  Ticket,
  UserPlus,
  Pill,
  UserCheck,
  CreditCard,
  Key,
  Building2,
  ClipboardCheck,
} from 'lucide-react';
import { getAdminNavConfig } from '@/lib/nav/adminNav';
import { EONPRO_ICON, EONPRO_LOGO } from '@/lib/constants/brand-assets';

const adminNavIconMap = {
  Home,
  UserPlus,
  Users,
  Pill,
  ClipboardCheck,
  ShoppingCart,
  Ticket,
  Store,
  TrendingUp,
  UserCheck,
  DollarSign,
  FileText,
  CreditCard,
  Key,
  Settings,
  Building2,
} as const;

interface AdminLayoutProps {
  children: React.ReactNode;
  userData?: LayoutUser | null;
}

export default function AdminLayout({ children, userData }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const role = userData?.role?.toLowerCase() ?? 'admin';
  const navItems = useMemo(() => {
    const config = getAdminNavConfig(role);
    const items = config.map((item) => ({
      path: item.path,
      label: item.label,
      icon: adminNavIconMap[item.iconKey as keyof typeof adminNavIconMap] ?? Settings,
    }));
    if (items[0]?.path === '/') {
      items[0] = { ...items[0], path: '/admin', label: 'Dashboard' };
    }
    return items;
  }, [role]);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch((err: unknown) => {
        logger.debug('Logout API call failed (continuing with redirect)', {
          message: err instanceof Error ? err.message : 'Unknown',
        });
      });
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  };

  const isActive = (path: string) => {
    if (path === '/admin') {
      return pathname === '/admin';
    }
    return pathname === path || pathname.startsWith(path + '/');
  };

  return (
    <div className="flex min-h-screen bg-[#efece7]">
      {/* Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 flex flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        {/* Logo */}
        <div className="mb-6 flex items-center justify-center px-4">
          <Link href="/">
            {sidebarExpanded ? (
              <img
                src={EONPRO_LOGO}
                alt="EONPRO"
                className="h-10 w-auto"
              />
            ) : (
              <img
                src={EONPRO_ICON}
                alt="EONPRO"
                className="h-10 w-10 object-contain"
              />
            )}
          </Link>
        </div>

        {/* Expand Button */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className={`absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition-all hover:bg-gray-50 focus:outline-none ${
            sidebarExpanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronRight className="h-3 w-3 text-gray-400" />
        </button>

        {/* Navigation Icons */}
        <nav className="flex flex-1 flex-col space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  active
                    ? 'bg-[#4fa77e]/10 text-[#4fa77e]'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3">
          <button
            type="button"
            onClick={handleLogout}
            title={!sidebarExpanded ? 'Logout' : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarExpanded && (
              <span className="whitespace-nowrap text-sm font-medium">Logout</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarExpanded ? 'ml-56' : 'ml-20'}`}>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
