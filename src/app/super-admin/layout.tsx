'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  Building2,
  Settings,
  LogOut,
  ChevronRight,
  Users,
  DollarSign,
  UserCog,
  Activity,
  Ticket,
  Receipt,
} from 'lucide-react';
import { isBrowser, safeLocalStorage } from '@/lib/utils/ssr-safe';
import InternalChat from '@/components/InternalChat';
import {
  NotificationProvider,
  NotificationCenter,
  NotificationToastContainer,
} from '@/components/notifications';
import { ClinicBrandingProvider } from '@/lib/contexts/ClinicBrandingContext';
import { EONPRO_ICON, EONPRO_LOGO } from '@/lib/constants/brand-assets';
import { safeParseJsonString } from '@/lib/utils/safe-json';

const navItems = [
  { icon: Shield, path: '/super-admin', label: 'Dashboard', exact: true },
  { icon: Building2, path: '/super-admin/clinics', label: 'Clinics' },
  { icon: UserCog, path: '/super-admin/providers', label: 'Providers' },
  { icon: Users, path: '/super-admin/affiliates', label: 'Affiliates' },
  { icon: Ticket, path: '/tickets', label: 'Tickets' },
  { icon: Activity, path: '/super-admin/user-activity', label: 'User Activity' },
  { icon: DollarSign, path: '/super-admin/commission-plans', label: 'Commission Plans' },
  // Clinic Billing (config, invoices, reports) — super-admin only; do not add to tickets or admin nav
  { icon: Receipt, path: '/super-admin/clinic-billing', label: 'Clinic Billing' },
  { icon: Settings, path: '/super-admin/settings', label: 'Settings' },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = safeParseJsonString(user);
      if (!parsedUser) { router.push('/login'); return; }
      const role = parsedUser.role?.toLowerCase();
      if (role !== 'super_admin') {
        router.push('/login');
        return;
      }
      // Ensure userId is always a number (might be string from localStorage)
      setUserId(parsedUser.id ? Number(parsedUser.id) : null);
      setUserName(
        `${parsedUser.firstName || ''} ${parsedUser.lastName || ''}`.trim() || parsedUser.email
      );
      setLoading(false);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token =
      safeLocalStorage.getItem('auth-token') || safeLocalStorage.getItem('super_admin-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    safeLocalStorage.removeItem('user');
    safeLocalStorage.removeItem('auth-token');
    safeLocalStorage.removeItem('admin-token');
    safeLocalStorage.removeItem('provider-token');
    safeLocalStorage.removeItem('super_admin-token');
    safeLocalStorage.removeItem('access_token');
    safeLocalStorage.removeItem('refresh_token');
    safeLocalStorage.removeItem('token_timestamp');
    if (typeof document !== 'undefined' && document.cookie) {
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
      });
    }
    window.location.href = '/login';
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return pathname === path;
    return pathname === path || pathname?.startsWith(path + '/');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <img src={EONPRO_ICON} alt="Loading" className="h-12 w-12 animate-pulse object-contain" />
      </div>
    );
  }

  return (
    <ClinicBrandingProvider>
      <NotificationProvider>
        <div className="flex min-h-screen bg-[#efece7]">
          {/* Sidebar */}
          <aside
            className={`fixed bottom-0 left-0 top-0 z-50 flex flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 ${
              sidebarExpanded ? 'w-56' : 'w-20'
            }`}
          >
            {/* Logo */}
            <div className="mb-6 flex items-center justify-center px-4">
              <Link href="/super-admin">
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
                const active = isActive(item.path, item.exact);

                const handleNavClick = (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();

                  if (pathname === item.path) {
                    window.location.reload();
                  } else {
                    window.location.href = item.path;
                  }
                };

                return (
                  <button
                    key={item.path}
                    onClick={handleNavClick}
                    title={!sidebarExpanded ? item.label : undefined}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      active
                        ? 'bg-[#4fa77e]/10 text-[#4fa77e]'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {sidebarExpanded && (
                      <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* User Info & Logout */}
            <div className="space-y-2 border-t border-gray-100 px-3 pt-4">
              {sidebarExpanded && userName && (
                <div className="truncate px-3 py-2 text-xs text-gray-500">{userName}</div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                title={!sidebarExpanded ? 'Logout' : undefined}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="whitespace-nowrap text-sm font-medium">Sign Out</span>
                )}
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main
            className={`flex-1 transition-all duration-300 ${sidebarExpanded ? 'ml-56' : 'ml-20'}`}
          >
            {/* Top Left Notification Bar */}
            <div className="sticky top-0 z-40 border-b border-gray-200/50 bg-[#efece7]/95 px-6 py-3 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <NotificationCenter
                    notificationsPath="/super-admin/notifications"
                    dropdownPosition="left"
                  />
                  <span className="text-sm font-medium text-gray-600">Notifications</span>
                </div>
              </div>
            </div>

            {children}
          </main>

          {/* Internal Team Chat */}
          {userId && <InternalChat currentUserId={userId} currentUserRole="super_admin" />}
        </div>
        <NotificationToastContainer />
      </NotificationProvider>
    </ClinicBrandingProvider>
  );
}
