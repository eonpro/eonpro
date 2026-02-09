'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';
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
  Ticket,
  UserCheck,
  CreditCard,
  Key,
  Building2,
} from 'lucide-react';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { getStoredUserRole } from '@/lib/auth/stored-role';
import { getAdminNavConfig, getNonAdminNavConfig } from '@/lib/nav/adminNav';

const EONPRO_LOGO =
  'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';
const EONPRO_ICON =
  'https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png';

const ALLOWED_ROLES = ['admin', 'super_admin', 'provider', 'staff', 'support'];

const adminNavIconMap = {
  Home,
  UserPlus,
  Users,
  Pill,
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

function IntakeFormsLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(() => getStoredUserRole(ALLOWED_ROLES));

  const primaryColor = branding?.primaryColor || '#4fa77e';
  const clinicLogo = branding?.logoUrl || EONPRO_LOGO;
  const clinicIcon = branding?.iconUrl || EONPRO_ICON;
  const clinicName = branding?.clinicName || 'EONPRO';

  const navItems = useMemo(() => {
    const config =
      userRole === 'admin' || userRole === 'super_admin'
        ? getAdminNavConfig(userRole)
        : getNonAdminNavConfig(userRole);
    return navConfigToItems(config);
  }, [userRole]);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push(
        '/login?redirect=' + encodeURIComponent(window.location.pathname || '/intake-forms')
      );
      return;
    }
    try {
      const parsed = JSON.parse(user);
      const role = (parsed.role || '').toLowerCase();
      if (!ALLOWED_ROLES.includes(role)) {
        router.push('/');
        return;
      }
      setUserRole(role);
      setLoading(false);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

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
    if (path === '/') return pathname === '/';
    if (path === '/intake-forms') return pathname?.startsWith('/intake-forms');
    return pathname === path || pathname?.startsWith(path + '/');
  };

  if (loading || brandingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#efece7]">
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 flex flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        <div className="mb-6 flex flex-col items-center px-4">
          <Link href="/">
            {sidebarExpanded ? (
              <img src={clinicLogo} alt={clinicName} className="h-10 w-auto max-w-[140px] object-contain" />
            ) : (
              <img src={clinicIcon} alt={clinicName} className="h-10 w-10 object-contain" />
            )}
          </Link>
        </div>

        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className={`absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition-all hover:bg-gray-50 focus:outline-none ${
            sidebarExpanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronRight className="h-3 w-3 text-gray-400" />
        </button>

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

      <main className={`flex-1 transition-all duration-300 ${sidebarExpanded ? 'ml-56' : 'ml-20'}`}>
        {children}
      </main>
    </div>
  );
}

export default function IntakeFormsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicBrandingProvider>
      <IntakeFormsLayoutInner>{children}</IntakeFormsLayoutInner>
    </ClinicBrandingProvider>
  );
}
