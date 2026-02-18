'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Users,
  UserPlus,
  Building2,
  ClipboardCheck,
  ShoppingCart,
  Store,
  TrendingUp,
  DollarSign,
  Settings,
  LogOut,
  ChevronRight,
  CreditCard,
  Key,
  AlertTriangle,
  RefreshCw,
  Pill,
  UserCheck,
  Ticket,
  Shield,
  UserCog,
  Activity,
  Receipt,
} from 'lucide-react';
import InternalChat from '@/components/InternalChat';
import {
  NotificationProvider,
  NotificationCenter,
  NotificationToastContainer,
} from '@/components/notifications';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getStoredUserRole } from '@/lib/auth/stored-role';
import { getAdminNavConfig } from '@/lib/nav/adminNav';
import { logger } from '@/lib/logger';
import { EONPRO_LOGO, EONPRO_ICON } from '@/lib/constants/brand-assets';

const TICKETS_ALLOWED_ROLES = ['admin', 'super_admin', 'provider', 'staff', 'support'];

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
  CreditCard,
  Key,
  Settings,
  Building2,
} as const;

// Fallback UI for ticket errors (used by ErrorBoundary - reports to Sentry)
const TicketsErrorFallback = (
  <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
    <div className="mx-4 max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <AlertTriangle className="h-8 w-8 text-red-600" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-gray-900">Something went wrong</h2>
      <p className="mb-6 text-gray-600">
        The tickets page encountered an error. Our team has been notified.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-white transition-colors hover:bg-green-700"
      >
        <RefreshCw className="h-4 w-4" />
        Reload Page
      </button>
    </div>
  </div>
);

// Non-admin nav (provider/staff/support) – role-specific paths
const getNavItemsForNonAdminRole = (role: string) => {
  switch (role) {
    case 'provider':
      return [
        { icon: Home, path: '/provider', label: 'Dashboard' },
        { icon: Users, path: '/provider/patients', label: 'My Patients' },
        { icon: Pill, path: '/provider/rx-queue', label: 'RX Queue' },
        { icon: Ticket, path: '/tickets', label: 'Tickets' },
        { icon: Settings, path: '/provider/settings', label: 'Settings' },
      ];
    case 'staff':
      return [
        { icon: Home, path: '/staff', label: 'Dashboard' },
        { icon: Users, path: '/staff/patients', label: 'Patients' },
        { icon: Ticket, path: '/tickets', label: 'Tickets' },
        { icon: Settings, path: '/staff/settings', label: 'Settings' },
      ];
    case 'support':
      return [
        { icon: Home, path: '/support', label: 'Dashboard' },
        { icon: Ticket, path: '/tickets', label: 'Tickets' },
        { icon: Users, path: '/support/patients', label: 'Patients' },
      ];
    default:
      return [
        { icon: Home, path: '/admin', label: 'Dashboard' },
        { icon: Ticket, path: '/tickets', label: 'Tickets' },
      ];
  }
};

function TicketsLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string>(() => getStoredUserRole(TICKETS_ALLOWED_ROLES) ?? 'admin');

  // Get branding colors with fallbacks
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const clinicLogo = branding?.logoUrl || EONPRO_LOGO;
  const clinicIcon = branding?.iconUrl || EONPRO_ICON;
  const clinicName = branding?.clinicName || 'EONPRO';
  const isWhiteLabeled = branding?.clinicName && branding.clinicName !== 'EONPRO';

  useEffect(() => {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        router.push('/login');
        return;
      }

      const parsedUser = JSON.parse(user);
      const role = parsedUser.role?.toLowerCase();

      // Allow multiple roles to access tickets
      const allowedRoles = ['admin', 'super_admin', 'provider', 'staff', 'support'];
      if (!allowedRoles.includes(role)) {
        router.push('/login');
        return;
      }

      setUserId(parsedUser.id ? Number(parsedUser.id) : null);
      setUserRole(role);
      setLoading(false);
    } catch (error) {
      console.error('Error initializing tickets layout:', error);
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  // Build navigation: super_admin uses its own nav, admin uses shared adminNav, others get role-specific
  const navItems = useMemo(() => {
    if (userRole === 'super_admin') {
      return [
        { icon: Shield, path: '/super-admin', label: 'Dashboard' },
        { icon: Building2, path: '/super-admin/clinics', label: 'Clinics' },
        { icon: UserCog, path: '/super-admin/providers', label: 'Providers' },
        { icon: Users, path: '/super-admin/affiliates', label: 'Affiliates' },
        { icon: Ticket, path: '/tickets', label: 'Tickets' },
        { icon: Activity, path: '/super-admin/user-activity', label: 'User Activity' },
        { icon: DollarSign, path: '/super-admin/commission-plans', label: 'Commission Plans' },
        { icon: Receipt, path: '/super-admin/clinic-billing', label: 'Clinic Billing' },
        { icon: Settings, path: '/super-admin/settings', label: 'Settings' },
      ];
    }
    if (userRole === 'admin') {
      const config = getAdminNavConfig(userRole);
      const items = config.map((item) => ({
        path: item.path,
        label: item.label,
        icon: adminNavIconMap[item.iconKey as keyof typeof adminNavIconMap] ?? Settings,
      }));
      if (items[0]?.path === '/') {
        items[0] = { ...items[0], path: '/admin', label: 'Dashboard' };
      }
      return items;
    }
    return getNavItemsForNonAdminRole(userRole);
  }, [userRole]);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('admin-token') ||
      localStorage.getItem('super_admin-token') ||
      localStorage.getItem('provider-token');
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
    localStorage.removeItem('provider-token');
    localStorage.removeItem('super_admin-token');
    localStorage.removeItem('clinics');
    localStorage.removeItem('activeClinicId');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_timestamp');
    [
      'auth-token',
      'admin-token',
      'super_admin-token',
      'provider-token',
      'patient-token',
      'staff-token',
      'support-token',
      'affiliate-token',
    ].forEach((name) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });
    window.location.href = '/login';
  };

  const isActive = (path: string) => {
    if (path === '/admin' || path === '/provider' || path === '/staff' || path === '/support') {
      return pathname === path;
    }
    return pathname === path || pathname?.startsWith(path + '/');
  };

  if (loading || brandingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <img src={EONPRO_ICON} alt="Loading" className="h-12 w-12 animate-pulse object-contain" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#efece7]">
      {/* Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 flex flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center px-4">
          <Link href={navItems[0]?.path || '/admin'}>
            {sidebarExpanded ? (
              <img
                src={clinicLogo}
                alt={clinicName}
                className="h-10 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <img src={clinicIcon} alt={clinicName} className="h-10 w-10 object-contain" />
            )}
          </Link>
          {/* Powered by EONPRO - shown for white-labeled clinics */}
          {isWhiteLabeled && sidebarExpanded && (
            <span className="mt-1 flex items-center justify-center gap-1 text-[10px] text-gray-400">
              Powered by{' '}
              <img
                src={EONPRO_LOGO}
                alt="EONPRO"
                className="h-[21px] w-auto"
              />
            </span>
          )}
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
                  active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="space-y-2 border-t border-gray-100 px-3 pt-4">
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
        {/* Top Left Notification Bar */}
        <div className="sticky top-0 z-40 border-b border-gray-200/50 bg-[#efece7]/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <NotificationCenter
                notificationsPath="/admin/notifications"
                dropdownPosition="left"
              />
              <span className="text-sm font-medium text-gray-600">Notifications</span>
            </div>
          </div>
        </div>

        <div className="p-6">{children}</div>
      </main>

      {/* Internal Team Chat */}
      {userId && <InternalChat currentUserId={userId} currentUserRole={userRole} />}
    </div>
  );
}

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary fallback={TicketsErrorFallback}>
      <ClinicBrandingProvider>
        <NotificationProvider>
          <TicketsLayoutInner>{children}</TicketsLayoutInner>
          <NotificationToastContainer />
        </NotificationProvider>
      </ClinicBrandingProvider>
    </ErrorBoundary>
  );
}
