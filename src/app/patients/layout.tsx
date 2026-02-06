'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, Users, ShoppingCart, Store, TrendingUp,
  DollarSign, Settings, LogOut, ChevronRight, ClipboardList
} from 'lucide-react';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

// Default EONPRO logos
const EONPRO_LOGO = 'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';
const EONPRO_ICON = 'https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png';

// Base nav items - patients path will be set dynamically based on role
const getNavItems = (userRole: string | null) => {
  // Determine the correct patients path based on role
  const patientsPath = userRole === 'provider' ? '/provider/patients' : '/admin/patients';

  return [
    { icon: Home, path: '/', label: 'Home' },
    { icon: Users, path: patientsPath, label: 'Patients' },
    { icon: ShoppingCart, path: '/admin/orders', label: 'Orders' },
    { icon: Store, path: '/admin/products', label: 'Products' },
    { icon: ClipboardList, path: '/intake-forms', label: 'Intake Forms' },
    { icon: TrendingUp, path: '/admin/analytics', label: 'Analytics' },
    { icon: DollarSign, path: '/admin/finance', label: 'Finance' },
    { icon: Settings, path: '/admin/settings', label: 'Settings' },
  ];
};

// Roles allowed to access patient pages
const ALLOWED_ROLES = ['admin', 'super_admin', 'provider', 'staff', 'support'];

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
  const clinicIcon = branding?.iconUrl || EONPRO_ICON;
  const clinicName = branding?.clinicName || 'EONPRO';
  const isWhiteLabeled = branding?.clinicName && branding.clinicName !== 'EONPRO';

  // Get nav items based on user role
  const navItems = useMemo(() => getNavItems(userRole), [userRole]);

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
      setLoading(false);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]); // Intentionally exclude pathname - auth check should only run on mount

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token') || localStorage.getItem('provider-token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {});
      }
    } catch {}
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
      return pathname?.startsWith('/patients') ||
             pathname?.startsWith('/admin/patients') ||
             pathname?.startsWith('/provider/patients');
    }
    return pathname === path || pathname?.startsWith(path + '/');
  };

  // Show loading state while checking auth or loading branding
  if (loading || brandingLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#efece7]">
        <div
          className="animate-spin rounded-full h-12 w-12 border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        ></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#efece7] flex">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 bg-white border-r border-gray-200 flex flex-col py-4 z-50 transition-all duration-300 ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-6 px-4">
          <Link href="/">
            {sidebarExpanded ? (
              <img
                src={clinicLogo}
                alt={clinicName}
                className="h-10 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <img
                src={clinicIcon}
                alt={clinicName}
                className="h-10 w-10 object-contain"
              />
            )}
          </Link>
          {/* Powered by EONPRO - shown for white-labeled clinics */}
          {isWhiteLabeled && sidebarExpanded && (
            <span className="text-[10px] text-gray-400 mt-1">Powered by EONPRO</span>
          )}
        </div>

        {/* Expand Button */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className={`absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 focus:outline-none transition-all ${
            sidebarExpanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronRight className="h-3 w-3 text-gray-400" />
        </button>

        {/* Navigation Icons */}
        <nav className="flex-1 flex flex-col px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  active
                    ? ''
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3">
          <button
            onClick={handleLogout}
            title={!sidebarExpanded ? "Logout" : undefined}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all w-full"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarExpanded && (
              <span className="text-sm font-medium whitespace-nowrap">Logout</span>
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
