'use client';

import React, { useEffect, useState, useMemo, Component, ErrorInfo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, Users, UserPlus, Building2, ShoppingCart, Store, TrendingUp,
  DollarSign, Settings, LogOut, ChevronRight, CreditCard, Key, X, Lock, Pill, UserCheck, Bell, AlertTriangle, RefreshCw
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

class AdminErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AdminErrorBoundary] Caught error:', error, errorInfo);
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

const baseNavItems = [
  { icon: Home, path: '/', label: 'Home' },
  { icon: UserPlus, path: '/admin/intakes', label: 'Intakes' },
  { icon: Users, path: '/admin/patients', label: 'Patients' },
  { icon: Pill, path: '/admin/rx-queue', label: 'RX Queue' },
  { icon: ShoppingCart, path: '/admin/orders', label: 'Orders' },
  { icon: Store, path: '/admin/products', label: 'Products' },
  { icon: TrendingUp, path: '/admin/analytics', label: 'Analytics' },
  { icon: UserCheck, path: '/admin/affiliates', label: 'Affiliates' },
  { icon: DollarSign, path: '/admin/finance', label: 'Finance' },
  { icon: CreditCard, path: '/admin/stripe-dashboard', label: 'Stripe' },
  { icon: Key, path: '/admin/registration-codes', label: 'Registration Codes' },
  { icon: Settings, path: '/admin/settings', label: 'Settings' },
];

// Clinics tab only shown for multi-clinic admins or super_admin
const clinicsNavItem = { icon: Building2, path: '/admin/clinics', label: 'Clinics' };

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
      const response = await fetch('/api/user/clinics', {
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
      setUserId(parsedUser.id || null);
      setUserRole(role);
      setLoading(false);

      // Fetch user's clinics for multi-clinic support (non-blocking)
      fetchUserClinics().catch(err => {
        console.error('Error fetching user clinics:', err);
      });
    } catch (error) {
      console.error('Error initializing admin layout:', error);
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  // Build navigation items - only show Clinics tab for super_admin
  const navItems = useMemo(() => {
    const items = [...baseNavItems];

    // Insert Clinics tab after RX Queue for super_admin only
    if (userRole === 'super_admin') {
      items.splice(4, 0, clinicsNavItem);
    }

    return items;
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
      const verifyResponse = await fetch('/api/auth/verify-password', {
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
      const switchResponse = await fetch('/api/user/clinics', {
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

  // Handle Clinics tab click - for multi-clinic admins (not super_admin), show switch modal
  const handleClinicsClick = (e: React.MouseEvent, path: string) => {
    if (path === '/admin/clinics' && hasMultipleClinics && userRole !== 'super_admin') {
      e.preventDefault();
      setShowClinicSwitchModal(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    router.push('/login');
  };

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
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
            const isClinicsTab = item.path === '/admin/clinics';

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  console.log('[Nav] Clicked:', item.path);
                  handleClinicsClick(e, item.path);
                }}
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
                  <span className="text-sm font-medium whitespace-nowrap">
                    {isClinicsTab && hasMultipleClinics && userRole !== 'super_admin'
                      ? 'Switch Clinic'
                      : item.label}
                  </span>
                )}
              </Link>
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
        {children}
      </main>

      {/* Internal Team Chat */}
      {userId && (
        <InternalChat currentUserId={userId} currentUserRole={userRole} />
      )}

      {/* Clinic Switch Modal - for multi-clinic admins */}
      {showClinicSwitchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Switch Clinic</h2>
                  <p className="text-sm text-gray-500">Select a clinic and confirm with your password</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowClinicSwitchModal(false);
                  setPassword('');
                  setSwitchError('');
                  setSelectedClinicId(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* Current Clinic */}
            {activeClinicId && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-xs font-medium text-green-700 mb-1">Current Clinic</p>
                <p className="text-sm font-semibold text-green-900">
                  {userClinics.find(c => c.id === activeClinicId)?.name || 'Unknown'}
                </p>
              </div>
            )}

            {/* Clinic Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Clinic
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {userClinics.filter(c => c.id !== activeClinicId).map((clinic) => (
                  <button
                    key={clinic.id}
                    onClick={() => setSelectedClinicId(clinic.id)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                      selectedClinicId === clinic.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Use iconUrl or faviconUrl for smaller icon display, fallback to logoUrl */}
                      {(clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl) ? (
                        <img
                          src={clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl || ''}
                          alt={clinic.name} 
                          className="w-8 h-8 rounded-lg object-contain"
                        />
                      ) : (
                        <div 
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="h-4 w-4 inline mr-1" />
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
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {switchError && (
                <p className="mt-2 text-sm text-red-600">{switchError}</p>
              )}
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
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClinicSwitch}
                disabled={!selectedClinicId || !password || switching}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <AdminLayoutInner>{children}</AdminLayoutInner>
          <NotificationToastContainer />
        </NotificationProvider>
      </ClinicBrandingProvider>
    </AdminErrorBoundary>
  );
}
