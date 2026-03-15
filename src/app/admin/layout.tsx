'use client';

import React, { useEffect, useState, useMemo, Component, ErrorInfo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Users,
  UserPlus,
  Building2,
  ShoppingCart,
  Store,
  TrendingUp,
  DollarSign,
  Settings,
  LogOut,
  ChevronRight,
  CreditCard,
  Key,
  X,
  Lock,
  Pill,
  UserCheck,
  Bell,
  AlertTriangle,
  RefreshCw,
  Ticket,
  Gauge,
  ClipboardCheck,
  FileText,
  MessageSquare,
  Link as LinkIcon,
  Camera,
  Truck,
  Shield,
} from 'lucide-react';
import InternalChat from '@/components/InternalChat';
import {
  NotificationProvider,
  NotificationCenter,
  NotificationToastContainer,
} from '@/components/notifications';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { SubdomainClinicBanner } from '@/components/SubdomainClinicBanner';
import { getAdminNavConfig } from '@/lib/nav/adminNav';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';
import { apiFetch, redirectToLogin } from '@/lib/api/fetch';
import { EONPRO_LOGO, EONPRO_ICON, LOGOSRX, isLogosRxHost as checkIsLogosRxHost } from '@/lib/constants/brand-assets';
import { safeParseJsonString } from '@/lib/utils/safe-json';
import { useAuthStore } from '@/lib/stores/authStore';

const LOGOSRX_LOGO = LOGOSRX.LOGO;
const LOGOSRX_ICON = LOGOSRX.ICON;
const LOGOSRX_PRIMARY = LOGOSRX.PRIMARY;

// Error Boundary to catch and recover from React errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AdminErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('AdminErrorBoundary caught an error', error, { componentStack: errorInfo.componentStack });
    Sentry.withScope((scope) => {
      scope.setContext('errorBoundary', { componentStack: errorInfo.componentStack });
      scope.setLevel('error');
      Sentry.captureException(error);
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
          <div className="mx-4 max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900">Something went wrong</h2>
            <p className="mb-6 text-gray-600">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-white transition-colors hover:bg-green-700"
            >
              <RefreshCw className="h-4 w-4" />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface UserClinic {
  id: number;
  name: string;
  subdomain: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  isPrimary: boolean;
}

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
  Gauge,
  FileText,
  MessageSquare,
  Link: LinkIcon,
  Camera,
  Truck,
  Shield,
} as const;

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const authUser = useAuthStore((s) => s.user);
  const authRole = useAuthStore((s) => s.role);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string>('admin');
  const [userClinics, setUserClinics] = useState<UserClinic[]>([]);
  const [activeClinicId, setActiveClinicId] = useState<number | null>(null);
  const [hasMultipleClinics, setHasMultipleClinics] = useState(false);
  const [showClinicSwitchModal, setShowClinicSwitchModal] = useState(false);
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [switchError, setSwitchError] = useState('');
  const [switching, setSwitching] = useState(false);

  const isPharmacyRep = userRole === 'pharmacy_rep';
  const [isLogosRx, setIsLogosRx] = useState(false);

  useEffect(() => {
    setIsLogosRx(checkIsLogosRxHost());
  }, []);

  // SESSION_EXPIRED_EVENT is handled globally by the Zustand authStore
  // (src/lib/stores/authStore.ts) — no per-layout listener needed.

  const isPharmacyExperience = isPharmacyRep || isLogosRx;

  // LogosRx pharmacy reps always see LogosRx branding, regardless of active clinic
  const primaryColor = isPharmacyExperience ? LOGOSRX_PRIMARY : (branding?.primaryColor || '#4fa77e');
  const clinicLogo = isPharmacyExperience ? LOGOSRX_LOGO : (branding?.logoUrl || EONPRO_LOGO);
  const clinicIcon = isPharmacyExperience ? LOGOSRX_ICON : (branding?.iconUrl || EONPRO_ICON);
  const clinicName = isPharmacyExperience ? 'LogosRx' : (branding?.clinicName || 'EONPRO');
  const isWhiteLabeled = isPharmacyExperience || (branding?.clinicName && branding.clinicName !== 'EONPRO');

  // Fetch user's clinic assignments
  const fetchUserClinics = async () => {
    try {
      const response = await apiFetch('/api/user/clinics');
      if (response.ok) {
        const data = await response.json();
        setUserClinics(data.clinics || []);
        setActiveClinicId(data.activeClinicId);
        setHasMultipleClinics(data.hasMultipleClinics || false);
      } else {
        // Non-blocking - just log the error
        console.warn('Failed to fetch user clinics:', response.status);
      }
    } catch (error) {
      if ((error as { isAuthError?: boolean }).isAuthError) {
        redirectToLogin('session_expired');
        return;
      }
      console.error('Error fetching user clinics:', error);
    }
  };

  // Auth check: read from the Zustand store (hydrated from localStorage once in
  // root layout) instead of reading localStorage directly in every layout.
  useEffect(() => {
    if (!isHydrated) return;

    if (!isAuthenticated || !authUser || !authRole) {
      setLoading(false);
      router.push('/login');
      return;
    }

    const role = authRole;
    const allowedAdminRoles = ['admin', 'super_admin', 'sales_rep', 'provider', 'staff', 'pharmacy_rep'];
    if (!allowedAdminRoles.includes(role)) {
      setLoading(false);
      router.push('/login');
      return;
    }
    if (role === 'super_admin' && pathname === '/admin') {
      setLoading(false);
      router.push('/super-admin');
      return;
    }
    if (role === 'sales_rep') {
      const restrictedPaths = [
        '/admin/affiliates',
        '/admin/finance',
        '/admin/products',
        '/admin/analytics',
        '/admin/stripe-dashboard',
        '/admin/finance/pending-profiles',
        '/admin/registration-codes',
        '/admin/sales-rep/commission-plans',
      ];
      if (restrictedPaths.some((p) => pathname === p || pathname?.startsWith(p + '/'))) {
        setLoading(false);
        router.replace('/admin');
        return;
      }
    }
    setUserId(authUser.id ?? null);
    setUserRole(role);
    setLoading(false);

    fetchUserClinics().catch((err) => {
      console.error('Error fetching user clinics:', err);
    });
  }, [isHydrated, isAuthenticated, authUser, authRole, router, pathname]);

  // Redirect sales rep away from company-level routes (e.g. direct URL or client nav)
  useEffect(() => {
    if (loading || userRole !== 'sales_rep') return;
    const restrictedPaths = [
      '/admin/affiliates',
      '/admin/finance',
      '/admin/products',
      '/admin/analytics',
      '/admin/stripe-dashboard',
      '/admin/finance/pending-profiles',
      '/admin/registration-codes',
      '/admin/sales-rep/commission-plans',
    ];
    if (restrictedPaths.some((p) => pathname === p || pathname?.startsWith(p + '/'))) {
      router.replace('/admin');
      return;
    }
  }, [loading, userRole, pathname, router]);

  // Build navigation items from shared config (same as patients layout for consistency)
  const navItems = useMemo(() => {
    const config = getAdminNavConfig(userRole);
    return config.map((item) => ({
      ...item,
      icon: adminNavIconMap[item.iconKey as keyof typeof adminNavIconMap] ?? Settings,
    }));
  }, [userRole]);

  // Pharmacy nav fix: Next.js App Router intercepts <a> clicks for client-side
  // navigation which silently fails for pharmacy_rep. Attach native DOM listeners
  // that call window.location.href directly, bypassing Next.js entirely.
  useEffect(() => {
    if (!isPharmacyExperience || loading) return;

    const handler = (e: Event) => {
      const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      window.location.href = href;
    };

    const sidebar = document.querySelector('aside');
    const bottomNav = document.querySelector('nav.fixed.bottom-0');
    sidebar?.addEventListener('click', handler, true);
    bottomNav?.addEventListener('click', handler, true);

    return () => {
      sidebar?.removeEventListener('click', handler, true);
      bottomNav?.removeEventListener('click', handler, true);
    };
  }, [isPharmacyExperience, loading]);

  // Handle clinic switching with password confirmation
  const handleClinicSwitch = async () => {
    if (!selectedClinicId || !password) {
      setSwitchError('Please select a clinic and enter your password');
      return;
    }

    setSwitching(true);
    setSwitchError('');

    try {
      // First verify password
      const verifyResponse = await apiFetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!verifyResponse.ok) {
        setSwitchError('Invalid password');
        setSwitching(false);
        return;
      }

      // Then switch clinic
      const switchResponse = await apiFetch('/api/user/clinics', {
        method: 'PUT',
        body: JSON.stringify({ clinicId: selectedClinicId }),
      });

      if (switchResponse.ok) {
        const data = await switchResponse.json();
        setActiveClinicId(selectedClinicId);
        setShowClinicSwitchModal(false);
        setPassword('');
        setSelectedClinicId(null);

        // Update the selected-clinic cookie for data isolation
        document.cookie = `selected-clinic=${selectedClinicId}; path=/; max-age=31536000`;

        // Reload to refresh all data with new clinic context
        window.location.reload();
      } else {
        const errorData = await switchResponse.json();
        setSwitchError(errorData.error || 'Failed to switch clinic');
      }
    } catch (error) {
      setSwitchError('An error occurred while switching clinics');
    } finally {
      setSwitching(false);
    }
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('admin-token') ||
      localStorage.getItem('super_admin-token') ||
      localStorage.getItem('provider-token') ||
      localStorage.getItem('staff-token') ||
      localStorage.getItem('sales_rep-token') ||
      localStorage.getItem('pharmacy_rep-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
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
      'sales_rep-token',
      'pharmacy_rep-token',
      'selected-clinic',
    ].forEach((name) => {
      // Clear on current hostname (e.g. ot.eonpro.io)
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      // Clear on shared parent domain (.eonpro.io)
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.eonpro.io;`;
    });
    window.location.href = '/login';
  };

  const isActive = (path: string) => {
    if (path === '/' || path === '/admin') return pathname === path;
    return pathname === path || pathname?.startsWith(path + '/');
  };

  return (
    <div className="flex min-h-screen bg-[#efece7]">
      {/* Sidebar — hidden on mobile, visible on md+ */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 hidden flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 md:flex ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        {!loading ? (
          <>
            {/* Logo */}
            <div className="mb-6 flex flex-col items-center px-4">
              <a href={isPharmacyExperience ? '/admin' : '/'}>
                {sidebarExpanded ? (
                  <img src={clinicLogo} alt={clinicName} className="h-10 w-auto max-w-[140px] object-contain" />
                ) : (
                  <img src={clinicIcon} alt={clinicName} className="h-10 w-10 object-contain" />
                )}
              </a>
              {isWhiteLabeled && sidebarExpanded && (
                <span className="mt-1 flex items-center justify-center gap-1 text-[10px] text-gray-400">
                  Powered by{' '}
                  <img src={EONPRO_LOGO} alt="EONPRO" className="h-[21px] w-auto" />
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

            <nav className="flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto px-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                const isClinicsTab = item.path === '/admin/clinics';
                const isClinicSwitch = isClinicsTab && hasMultipleClinics && userRole !== 'super_admin';

                if (isClinicSwitch) {
                  return (
                    <button
                      key={item.path}
                      onClick={() => setShowClinicSwitchModal(true)}
                      title={!sidebarExpanded ? 'Switch Clinic' : undefined}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      {sidebarExpanded && (
                        <span className="whitespace-nowrap text-sm font-medium">Switch Clinic</span>
                      )}
                    </button>
                  );
                }

                const NavTag = isPharmacyExperience ? 'a' : Link;
                return (
                  <NavTag
                    key={item.path}
                    href={item.path}
                    title={!sidebarExpanded ? item.label : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left no-underline transition-colors ${
                      active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                    style={active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {sidebarExpanded && (
                      <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                    )}
                  </NavTag>
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
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <img src={EONPRO_ICON} alt="Loading" className="h-8 w-8 animate-pulse object-contain" />
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className={`flex-1 pb-20 transition-all duration-300 md:pb-0 ${sidebarExpanded ? 'md:ml-56' : 'md:ml-20'}`}>
        {/* Top Notification Bar */}
        <div className="sticky top-0 z-40 border-b border-gray-200/50 bg-[#efece7]/95 px-4 py-2.5 backdrop-blur-sm md:px-6 md:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <NotificationCenter
                notificationsPath="/admin/notifications"
                dropdownPosition="left"
              />
              <span className="hidden text-sm font-medium text-gray-600 sm:inline">Notifications</span>
            </div>
          </div>
        </div>

        {children}
      </main>

      {/* Mobile Bottom Navigation — visible only on small screens */}
      <nav className="fixed bottom-0 left-0 right-0 z-[55] border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const isClinicsTab = item.path === '/admin/clinics';
            const isClinicSwitch = isClinicsTab && hasMultipleClinics && userRole !== 'super_admin';

            if (isClinicSwitch) {
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => setShowClinicSwitchModal(true)}
                  className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-3 text-gray-400 active:text-gray-600"
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="truncate text-[10px] font-medium leading-tight">Switch</span>
                </button>
              );
            }

            return (
              <a
                key={item.path}
                href={item.path}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-3 no-underline transition-colors ${
                  active ? '' : 'text-gray-400 active:text-gray-600'
                }`}
                style={active ? { color: primaryColor } : {}}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="truncate text-[10px] font-medium leading-tight">{item.label}</span>
              </a>
            );
          })}
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-3 text-gray-400 transition-colors active:text-gray-600"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            <span className="text-[10px] font-medium leading-tight">Logout</span>
          </button>
        </div>
      </nav>

      {/* Internal Team Chat */}
      {userId && <InternalChat currentUserId={userId} currentUserRole={userRole} />}

      {/* Clinic Switch Modal - for multi-clinic admins */}
      {showClinicSwitchModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Switch Clinic</h2>
                  <p className="text-sm text-gray-500">
                    Select a clinic and confirm with your password
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowClinicSwitchModal(false);
                  setPassword('');
                  setSwitchError('');
                  setSelectedClinicId(null);
                }}
                className="rounded-lg p-2 transition-colors hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* Current Clinic */}
            {activeClinicId && (
              <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3">
                <p className="mb-1 text-xs font-medium text-green-700">Current Clinic</p>
                <p className="text-sm font-semibold text-green-900">
                  {userClinics.find((c) => c.id === activeClinicId)?.name || 'Unknown'}
                </p>
              </div>
            )}

            {/* Clinic Selection */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Select Clinic</label>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {userClinics
                  .filter((c) => c.id !== activeClinicId)
                  .map((clinic) => (
                    <button
                      key={clinic.id}
                      onClick={() => setSelectedClinicId(clinic.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-all ${
                        selectedClinicId === clinic.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Use iconUrl or faviconUrl for smaller icon display, fallback to logoUrl */}
                        {clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl ? (
                          <img
                            src={clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl || ''}
                            alt={clinic.name}
                            className="h-8 w-8 rounded-lg object-contain"
                          />
                        ) : (
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                            style={{ backgroundColor: clinic.primaryColor || primaryColor }}
                          >
                            {clinic.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{clinic.name}</p>
                          {clinic.subdomain && (
                            <p className="text-xs text-gray-500">{clinic.subdomain}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            {/* Password Confirmation */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                <Lock className="mr-1 inline h-4 w-4" />
                Confirm Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setSwitchError('');
                }}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
              {switchError && <p className="mt-2 text-sm text-red-600">{switchError}</p>}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowClinicSwitchModal(false);
                  setPassword('');
                  setSwitchError('');
                  setSelectedClinicId(null);
                }}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClinicSwitch}
                disabled={!selectedClinicId || !password || switching}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {switching ? 'Switching...' : 'Switch Clinic'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminErrorBoundary>
      <ClinicBrandingProvider>
        <NotificationProvider>
          <SubdomainClinicBanner />
          <AdminLayoutInner>{children}</AdminLayoutInner>
          <NotificationToastContainer />
        </NotificationProvider>
      </ClinicBrandingProvider>
    </AdminErrorBoundary>
  );
}
