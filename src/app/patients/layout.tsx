'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
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
} from 'lucide-react';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { getStoredUserRole } from '@/lib/auth/stored-role';
import { getAdminNavConfig, getNonAdminNavConfig } from '@/lib/nav/adminNav';
import { logger } from '@/lib/logger';
import { EONPRO_LOGO, EONPRO_ICON } from '@/lib/constants/brand-assets';

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
} as const;

function navConfigToItems(config: { path: string; label: string; iconKey: string }[]) {
  return config.map((item) => ({
    ...item,
    icon: adminNavIconMap[item.iconKey as keyof typeof adminNavIconMap] ?? Settings,
  }));
}

// Roles allowed to access patient pages
const ALLOWED_ROLES = ['admin', 'super_admin', 'provider', 'staff', 'support'];

function PatientsLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(() => getStoredUserRole(ALLOWED_ROLES));

  // Get branding colors with fallbacks
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const clinicLogo = branding?.logoUrl || EONPRO_LOGO;
  const clinicIcon = branding?.iconUrl || EONPRO_ICON;
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
      const parsedUser = JSON.parse(user);
      const role = parsedUser.role?.toLowerCase();
      if (!ALLOWED_ROLES.includes(role)) {
        // User doesn't have permission to view patients
        router.push('/');
        return;
      }
      setUserRole(role);
      // Providers should use /provider/patients/[id] for consistent ProviderLayout context
      if (role === 'provider' && pathname?.startsWith('/patients/') && !pathname.startsWith('/provider/patients/')) {
        const patientId = pathname.replace(/^\/patients\//, '').split('?')[0];
        const query = typeof window !== 'undefined' ? window.location.search : '';
        router.replace(`/provider/patients/${patientId}${query}`);
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
    if (path === '/') return pathname === '/';
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

  // Show loading state while checking auth or loading branding
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
          <Link href="/">
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
            return (
              <Link
                key={item.path}
                href={item.path}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
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
        {children}
      </main>
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
