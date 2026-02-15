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
import { apiFetch } from '@/lib/api/fetch';

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

// Default EONPRO logos
const EONPRO_LOGO =
  'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';
const EONPRO_ICON =
  'https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png';

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
} as const;

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
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

  // Get branding colors with fallbacks
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const clinicLogo = branding?.logoUrl || EONPRO_LOGO;
  const clinicIcon = branding?.iconUrl || EONPRO_ICON;
  const clinicName = branding?.clinicName || 'EONPRO';
  const isWhiteLabeled = branding?.clinicName && branding.clinicName !== 'EONPRO';

  // Fetch user's clinic assignments
  const fetchUserClinics = async () => {
    try {
      const token = localStorage.getItem('auth-token');
      const response = await apiFetch('/api/user/clinics', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
      // Non-blocking - just log the error
      console.error('Error fetching user clinics:', error);
    }
  };

  useEffect(() => {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        router.push('/login');
        return;
      }

      const parsedUser = JSON.parse(user);
      const role = parsedUser.role?.toLowerCase();
      if (role !== 'admin' && role !== 'super_admin') {
        router.push('/login');
        return;
      }
      // Ensure userId is always a number (might be string from localStorage)
      setUserId(parsedUser.id ? Number(parsedUser.id) : null);
      setUserRole(role);
      setLoading(false);

      // Fetch user's clinics for multi-clinic support (non-blocking)
      fetchUserClinics().catch((err) => {
        console.error('Error fetching user clinics:', err);
      });
    } catch (error) {
      console.error('Error initializing admin layout:', error);
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  // Build navigation items from shared config (same as patients layout for consistency)
  const navItems = useMemo(() => {
    const config = getAdminNavConfig(userRole);
    return config.map((item) => ({
      ...item,
      icon: adminNavIconMap[item.iconKey as keyof typeof adminNavIconMap] ?? Settings,
    }));
  }, [userRole]);

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
      const token = localStorage.getItem('auth-token');
      const switchResponse = await apiFetch('/api/user/clinics', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
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
      localStorage.getItem('super_admin-token');
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
    ].forEach((name) => {
      // Clear on current hostname (e.g. ot.eonpro.io)
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      // Clear on shared parent domain (.eonpro.io)
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.eonpro.io;`;
    });
    window.location.href = '/login';
  };

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname?.startsWith(path + '/');
  };

  if (loading || brandingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        ></div>
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
                src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
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
            const isClinicsTab = item.path === '/admin/clinics';

            // Use button with direct navigation for reliability
            const handleNavClick = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[Nav] Button clicked:', item.path);

              // Handle special case for Clinics tab
              if (
                item.path === '/admin/clinics' &&
                hasMultipleClinics &&
                userRole !== 'super_admin'
              ) {
                setShowClinicSwitchModal(true);
                return;
              }

              // Navigate using window.location for maximum reliability
              if (active) {
                console.log('[Nav] Same page, reloading');
                window.location.reload();
              } else {
                console.log('[Nav] Navigating to:', item.path);
                window.location.href = item.path;
              }
            };

            return (
              <button
                key={item.path}
                onClick={handleNavClick}
                onMouseDown={(e) => {
                  console.log('[Nav] MouseDown:', item.path);
                }}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                  active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="whitespace-nowrap text-sm font-medium">
                    {isClinicsTab && hasMultipleClinics && userRole !== 'super_admin'
                      ? 'Switch Clinic'
                      : item.label}
                  </span>
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

        {children}
      </main>

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
