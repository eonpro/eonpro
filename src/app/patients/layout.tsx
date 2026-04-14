'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
// Link removed — plain <a> tags prevent RSC fetch hangs on subdomain deployments
import {
  Home,
  Users,
  ShoppingCart,
  Store,
  TrendingUp,
  DollarSign,
  Settings,
  LogOut,
  ChevronRight,
  ClipboardList,
  UserPlus,
  Pill,
  RefreshCw,
  Ticket,
  UserCheck,
  CreditCard,
  Key,
  Building2,
  ClipboardCheck,
  FileText,
  MessageSquare,
  Camera,
  BarChart3,
  Truck,
  Shield,
} from 'lucide-react';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { getAdminNavConfig, getNonAdminNavConfig } from '@/lib/nav/adminNav';
import { logger } from '@/lib/logger';
import { EONPRO_LOGO, EONPRO_ICON } from '@/lib/constants/brand-assets';
import { safeParseJsonString } from '@/lib/utils/safe-json';

const adminNavIconMap = {
  Home,
  UserPlus,
  Users,
  Pill,
  RefreshCw,
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
  ClipboardList,
  FileText,
  MessageSquare,
  Camera,
  BarChart3,
  Truck,
  Shield,
} as const;

function navConfigToItems(config: { path: string; label: string; iconKey: string }[]) {
  return config.map((item) => ({
    ...item,
    icon: adminNavIconMap[item.iconKey as keyof typeof adminNavIconMap] ?? Settings,
  }));
}

// Roles allowed to access patient pages
const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'provider',
  'staff',
  'support',
  'sales_rep',
  'pharmacy_rep',
];

function PatientsLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Get branding colors with fallbacks
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const clinicLogo = branding?.logoUrl || EONPRO_LOGO;
  const clinicIcon = branding?.iconUrl || branding?.faviconUrl || branding?.logoUrl || EONPRO_ICON;
  const clinicName = branding?.clinicName || 'EONPRO';
  const isWhiteLabeled = branding?.clinicName && branding.clinicName !== 'EONPRO';

  // Use same full admin nav as Home/admin when user is admin or super_admin (consistent sidebar)
  const navItems = useMemo(() => {
    const config =
      userRole === 'admin' || userRole === 'super_admin'
        ? getAdminNavConfig(userRole)
        : getNonAdminNavConfig(userRole);
    return navConfigToItems(config);
  }, [userRole]);

  // Authentication check on mount ONLY - removed pathname dependency to prevent logout on navigation
  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      // Only redirect to login if we're not already on a login-related page
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname || '/patients'));
      return;
    }

    try {
      const parsedUser = safeParseJsonString<Record<string, unknown>>(user);
      if (!parsedUser) {
        router.push('/login');
        return;
      }
      const role = String(parsedUser?.role ?? '').toLowerCase();
      if (!ALLOWED_ROLES.includes(role)) {
        router.push('/dashboard');
        return;
      }
      setUserRole(role);
      // Providers should use /provider/patients/[id] for consistent ProviderLayout context
      if (
        role === 'provider' &&
        pathname?.startsWith('/patients/') &&
        !pathname.startsWith('/provider/patients/')
      ) {
        const patientId = pathname.replace(/^\/patients\//, '').split('?')[0];
        const query = typeof window !== 'undefined' ? window.location.search : '';
        setLoading(false);
        router.replace(`/provider/patients/${patientId}${query}`);
        return;
      }
      // Admin-side roles should use /admin/patients/[id] for consistent AdminLayout context
      const adminRoles = ['admin', 'super_admin', 'staff', 'sales_rep', 'pharmacy_rep'];
      if (
        adminRoles.includes(role) &&
        pathname?.startsWith('/patients/') &&
        !pathname.startsWith('/admin/patients/')
      ) {
        const patientId = pathname.replace(/^\/patients\//, '').split('?')[0];
        const query = typeof window !== 'undefined' ? window.location.search : '';
        setLoading(false);
        router.replace(`/admin/patients/${patientId}${query}`);
        return;
      }
      setLoading(false);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]); // Intentionally exclude pathname - auth check should only run on mount

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('admin-token') ||
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
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    // Handle both admin and provider patient paths
    if (path === '/admin/patients' || path === '/provider/patients') {
      return (
        pathname?.startsWith('/patients') ||
        pathname?.startsWith('/admin/patients') ||
        pathname?.startsWith('/provider/patients')
      );
    }
    return pathname === path || pathname?.startsWith(path + '/');
  };

  const layoutReady = !loading;

  return (
    <div className="flex min-h-screen bg-[#efece7]">
      {/* Sidebar - render skeleton sidebar while loading, full sidebar when ready */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 hidden flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 md:flex ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        {layoutReady ? (
          <>
            {/* Logo */}
            <div className="mb-6 flex flex-col items-center px-4">
              <a href="/dashboard">
                {sidebarExpanded ? (
                  <img
                    src={clinicLogo}
                    alt={clinicName}
                    className="h-10 w-auto max-w-[140px] object-contain"
                    onError={(e) => {
                      e.currentTarget.src = EONPRO_LOGO;
                    }}
                  />
                ) : (
                  <img
                    src={clinicIcon}
                    alt={clinicName}
                    className="h-10 w-10 object-contain"
                    onError={(e) => {
                      e.currentTarget.src = EONPRO_ICON;
                    }}
                  />
                )}
              </a>
              {isWhiteLabeled && sidebarExpanded && (
                <span className="mt-1 flex items-center justify-center gap-1 whitespace-nowrap text-[10px] text-gray-400">
                  Powered by <img src={EONPRO_LOGO} alt="EONPRO" className="h-[21px] w-auto" />
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
            <nav className="flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto px-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <a
                    key={item.path}
                    href={item.path}
                    title={!sidebarExpanded ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                      active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                    style={
                      active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}
                    }
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {sidebarExpanded && (
                      <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                    )}
                  </a>
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
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <img src={EONPRO_ICON} alt="Loading" className="h-8 w-8 animate-pulse object-contain" />
          </div>
        )}
      </aside>

      {/* Main Content - always rendered so page-level loading.tsx skeleton shows */}
      <main
        className={`flex-1 pb-16 transition-all duration-300 md:pb-0 ${sidebarExpanded ? 'md:ml-56' : 'md:ml-20'}`}
      >
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      {layoutReady && (
        <nav className="fixed bottom-0 left-0 right-0 z-[55] border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="flex">
            {navItems.slice(0, 5).map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <a
                  key={item.path}
                  href={item.path}
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-3 ${
                    active ? '' : 'text-gray-400 active:text-gray-600'
                  }`}
                  style={active ? { color: primaryColor } : {}}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="truncate text-[10px] font-medium leading-tight">
                    {item.label}
                  </span>
                </a>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export default function PatientsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicBrandingProvider>
      <PatientsLayoutInner>{children}</PatientsLayoutInner>
    </ClinicBrandingProvider>
  );
}
