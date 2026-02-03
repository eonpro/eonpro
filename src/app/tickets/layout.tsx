'use client';

import React, { useEffect, useState, useMemo, Component, ErrorInfo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, Users, UserPlus, Building2, ShoppingCart, Store, TrendingUp,
  DollarSign, Settings, LogOut, ChevronRight, CreditCard, Key, AlertTriangle, RefreshCw, Pill, UserCheck, Ticket
} from 'lucide-react';
import InternalChat from '@/components/InternalChat';
import {
  NotificationProvider,
  NotificationCenter,
  NotificationToastContainer
} from '@/components/notifications';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

// Error Boundary to catch and recover from React errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class TicketsErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[TicketsErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#efece7] flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md mx-4 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Default EONPRO logos
const EONPRO_LOGO = 'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';
const EONPRO_ICON = 'https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png';

// Navigation items based on role
const getNavItemsForRole = (role: string) => {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return [
        { icon: Home, path: '/admin', label: 'Dashboard' },
        { icon: UserPlus, path: '/admin/intakes', label: 'Intakes' },
        { icon: Users, path: '/admin/patients', label: 'Patients' },
        { icon: Pill, path: '/admin/rx-queue', label: 'RX Queue' },
        { icon: ShoppingCart, path: '/admin/orders', label: 'Orders' },
        { icon: Ticket, path: '/tickets', label: 'Tickets' },
        { icon: Store, path: '/admin/products', label: 'Products' },
        { icon: TrendingUp, path: '/admin/analytics', label: 'Analytics' },
        { icon: UserCheck, path: '/admin/affiliates', label: 'Affiliates' },
        { icon: DollarSign, path: '/admin/finance', label: 'Finance' },
        { icon: CreditCard, path: '/admin/stripe-dashboard', label: 'Stripe' },
        { icon: Key, path: '/admin/registration-codes', label: 'Registration Codes' },
        { icon: Settings, path: '/admin/settings', label: 'Settings' },
      ];
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

// Clinics tab only shown for super_admin
const clinicsNavItem = { icon: Building2, path: '/admin/clinics', label: 'Clinics' };

function TicketsLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string>('admin');

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

  // Build navigation items based on role
  const navItems = useMemo(() => {
    const items = getNavItemsForRole(userRole);

    // Add Clinics tab for super_admin after RX Queue
    if (userRole === 'super_admin') {
      const rxQueueIndex = items.findIndex(item => item.path.includes('rx-queue'));
      if (rxQueueIndex !== -1) {
        items.splice(rxQueueIndex + 1, 0, clinicsNavItem);
      }
    }

    return items;
  }, [userRole]);

  const handleLogout = () => {
    // Clear all localStorage items
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    localStorage.removeItem('provider-token');
    localStorage.removeItem('super_admin-token');
    localStorage.removeItem('clinics');
    localStorage.removeItem('activeClinicId');

    // Clear all auth cookies to prevent session mismatch on next login
    const authCookies = [
      'auth-token', 'admin-token', 'super_admin-token',
      'provider-token', 'patient-token', 'staff-token',
      'support-token', 'affiliate-token', 'influencer-token'
    ];
    authCookies.forEach(name => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });

    router.push('/login');
  };

  const isActive = (path: string) => {
    if (path === '/admin' || path === '/provider' || path === '/staff' || path === '/support') {
      return pathname === path;
    }
    return pathname === path || pathname?.startsWith(path + '/');
  };

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
          <Link href={navItems[0]?.path || '/admin'}>
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

            const handleNavClick = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();

              if (active) {
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer w-full text-left ${
                  active
                    ? ''
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Notifications & Logout */}
        <div className="px-3 space-y-2 border-t border-gray-100 pt-4">
          {/* Notification Center */}
          <div className={`flex ${sidebarExpanded ? 'items-center gap-3 px-3' : 'justify-center'}`}>
            <NotificationCenter notificationsPath="/admin/notifications" dropdownPosition="left" />
            {sidebarExpanded && (
              <span className="text-sm font-medium text-gray-600">Notifications</span>
            )}
          </div>

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
        <div className="p-6">
          {children}
        </div>
      </main>

      {/* Internal Team Chat */}
      {userId && (
        <InternalChat currentUserId={userId} currentUserRole={userRole} />
      )}
    </div>
  );
}

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <TicketsErrorBoundary>
      <ClinicBrandingProvider>
        <NotificationProvider>
          <TicketsLayoutInner>{children}</TicketsLayoutInner>
          <NotificationToastContainer />
        </NotificationProvider>
      </ClinicBrandingProvider>
    </TicketsErrorBoundary>
  );
}
