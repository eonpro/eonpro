'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Scale,
  Pill,
  Package,
  CreditCard,
  BookOpen,
  Calculator,
  Settings,
  LogOut,
  ChevronRight,
  MessageCircle,
  Bell,
  User,
  Menu,
  X,
  Calendar,
  Trophy,
  HeartPulse,
  Activity,
  Camera,
} from 'lucide-react';
import { ClinicBrandingProvider, useClinicBranding, usePortalFeatures } from '@/lib/contexts/ClinicBrandingContext';
import { PWAUpdateBanner, OfflineBanner, InstallPrompt } from '@/components/PWAUpdateBanner';

// Default EONPRO logo
const EONPRO_LOGO = 'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';

// All possible nav items with their feature flag requirements
const allNavItems = [
  { icon: Home, path: '/patient-portal', label: 'Home', exact: true, feature: null }, // Always show
  { icon: Calendar, path: '/patient-portal/appointments', label: 'Appointments', feature: 'showAppointments' },
  { icon: HeartPulse, path: '/patient-portal/care-plan', label: 'My Care Plan', feature: 'showCarePlan' },
  { icon: Scale, path: '/patient-portal/progress', label: 'Progress', feature: 'showWeightTracking' },
  { icon: Camera, path: '/patient-portal/photos', label: 'Photos', feature: null }, // Always show - progress photos, ID verification
  { icon: Trophy, path: '/patient-portal/achievements', label: 'Achievements', feature: 'showAchievements' },
  { icon: Pill, path: '/patient-portal/medications', label: 'Medications', feature: null }, // Always show
  { icon: Package, path: '/patient-portal/shipments', label: 'Shipments', feature: 'showShipmentTracking' },
  { icon: Activity, path: '/patient-portal/symptom-checker', label: 'Symptom Checker', feature: 'showSymptomChecker' },
  { icon: Calculator, path: '/patient-portal/calculators', label: 'Tools', feature: null }, // Always show
  { icon: BookOpen, path: '/patient-portal/resources', label: 'Resources', feature: 'showResources' },
  { icon: CreditCard, path: '/patient-portal/subscription', label: 'Billing', feature: 'showBilling' },
  { icon: Settings, path: '/patient-portal/settings', label: 'Settings', feature: null }, // Always show
];

const allMobileNavItems = [
  { icon: Home, path: '/patient-portal', label: 'Home', exact: true, feature: null },
  { icon: Calendar, path: '/patient-portal/appointments', label: 'Appts', feature: 'showAppointments' },
  { icon: Scale, path: '/patient-portal/progress', label: 'Progress', feature: 'showWeightTracking' },
  { icon: Pill, path: '/patient-portal/medications', label: 'Meds', feature: null },
  { icon: User, path: '/patient-portal/settings', label: 'Profile', feature: null },
];

function PatientPortalLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const features = usePortalFeatures();

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState(3);

  // Filter nav items based on clinic feature flags
  const mainNavItems = allNavItems.filter(item => {
    if (item.feature === null) return true; // Always show items without feature requirement
    return features[item.feature as keyof typeof features] === true;
  });

  const mobileNavItems = allMobileNavItems.filter(item => {
    if (item.feature === null) return true;
    return features[item.feature as keyof typeof features] === true;
  });

  // Check if chat should be shown
  const showChat = features.showChat !== false;

  useEffect(() => {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('auth-token') || localStorage.getItem('patient-token');
    
    // Security: Redirect to login if no valid session
    if (!user || !token) {
      router.push('/login?redirect=/patient-portal&reason=no_session');
      return;
    }

    try {
      const data = JSON.parse(user);
      
      // Verify user has patient role
      if (data.role?.toLowerCase() !== 'patient') {
        router.push('/login?redirect=/patient-portal&reason=invalid_role');
        return;
      }
      
      setUserData(data);
    } catch (e) {
      // Invalid user data in localStorage
      localStorage.removeItem('user');
      localStorage.removeItem('auth-token');
      localStorage.removeItem('patient-token');
      router.push('/login?redirect=/patient-portal&reason=invalid_session');
      return;
    }
    
    setLoading(false);
  }, [router]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      // Call the logout API to terminate server session
      const token = localStorage.getItem('auth-token') || localStorage.getItem('patient-token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }).catch(() => {
          // Non-blocking - continue with client-side cleanup even if API fails
          console.warn('[Logout] API call failed, continuing with client cleanup');
        });
      }
    } catch (error) {
      console.warn('[Logout] Error calling logout API:', error);
    }

    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('patient-token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_timestamp');
    router.push('/login');
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return pathname === path;
    return pathname === path || pathname?.startsWith(path + '/');
  };

  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  if (loading || brandingLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#efece7]">
        <div
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] bg-[#efece7]">
      {/* Desktop Sidebar - Hidden on mobile */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 hidden flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 lg:flex ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        <div className="mb-6 flex items-center justify-center px-4">
          <Link href="/patient-portal">
            <img
              src={branding?.logoUrl || EONPRO_LOGO}
              alt={branding?.clinicName || 'EONPRO'}
              className={`${sidebarExpanded ? 'h-10 w-auto max-w-[140px]' : 'h-10 w-10'} object-contain`}
            />
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

        <nav className="flex flex-1 flex-col space-y-1 overflow-y-auto px-3">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path, item.exact);
            return (
              <Link
                key={item.path}
                href={item.path}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  active ? 'text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: primaryColor } : {}}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-gray-100 px-3 pt-4">
          {sidebarExpanded && userData && (
            <div className="truncate px-3 py-2 text-xs text-gray-500">
              {userData.firstName} {userData.lastName}
            </div>
          )}
          <button
            onClick={handleLogout}
            title={!sidebarExpanded ? 'Sign Out' : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarExpanded && (
              <span className="whitespace-nowrap text-sm font-medium">Sign Out</span>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Header - Optimized for iPhone notch */}
      <header className="fixed left-0 right-0 top-0 z-50 bg-white/95 backdrop-blur-lg lg:hidden">
        <div className="safe-top" />
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/patient-portal" className="flex items-center gap-3">
            <img 
              src={branding?.logoUrl || EONPRO_LOGO} 
              alt={branding?.clinicName || 'EONPRO'} 
              className="h-8 w-auto max-w-[120px] object-contain" 
            />
          </Link>
          <div className="flex items-center gap-1">
            {/* Notification Button - 44x44 touch target */}
            <button className="relative flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100">
              <Bell className="h-6 w-6" />
              {notifications > 0 && (
                <span
                  className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {notifications}
                </span>
              )}
            </button>
            {/* Menu Button - 44x44 touch target */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-out Menu */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed bottom-0 right-0 top-0 z-50 w-72 bg-white shadow-2xl lg:hidden">
            <div className="safe-top" />
            <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4">
              <span className="text-lg font-semibold text-gray-900">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 active:bg-gray-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="space-y-1 p-3">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path, item.exact);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-4 rounded-2xl px-4 py-4 transition-all active:scale-[0.98] ${
                      active ? 'text-white' : 'text-gray-700 active:bg-gray-100'
                    }`}
                    style={active ? { backgroundColor: primaryColor } : {}}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-base font-semibold">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 border-t border-gray-100 bg-gray-50 p-3">
              <div className="safe-bottom">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-red-50 px-4 py-4 text-red-600 active:bg-red-100"
                >
                  <LogOut className="h-6 w-6" />
                  <span className="text-base font-semibold">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main Content Area */}
      <main
        className={`flex-1 transition-all duration-300 lg:ml-20 ${sidebarExpanded ? 'lg:ml-56' : ''}`}
      >
        {/* Content padding accounts for header and bottom nav on mobile */}
        <div className="min-h-[100dvh] pb-24 pt-[calc(56px+env(safe-area-inset-top,0px))] lg:pb-0 lg:pt-0">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation - iPhone optimized */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg lg:hidden">
        <div className="border-t border-gray-200">
          <div className="mx-auto flex max-w-md justify-around">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path, item.exact);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className="group relative flex flex-1 flex-col items-center py-2"
                >
                  {/* Active indicator bar */}
                  {active && (
                    <div
                      className="absolute -top-[1px] left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                  )}
                  {/* Icon container - 44x44 touch target */}
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all ${
                      active ? '' : 'group-active:bg-gray-100'
                    }`}
                    style={active ? { backgroundColor: `${primaryColor}15` } : {}}
                  >
                    <Icon
                      className="h-6 w-6 transition-transform group-active:scale-90"
                      style={{ color: active ? primaryColor : '#9ca3af' }}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </div>
                  {/* Label */}
                  <span
                    className={`mt-0.5 text-[11px] transition-all ${active ? 'font-semibold' : 'font-medium'}`}
                    style={{ color: active ? primaryColor : '#9ca3af' }}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
        {/* Safe area for home indicator */}
        <div className="safe-bottom bg-white/95" />
      </nav>

      {/* Floating Chat Button - Above bottom nav on mobile (conditional on feature flag) */}
      {showChat && (
        <Link
          href="/patient-portal/chat"
          className="fixed z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-all active:scale-95 lg:bottom-6 lg:right-6"
          style={{
            backgroundColor: primaryColor,
            bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
            right: '16px',
            boxShadow: `0 4px 20px ${primaryColor}50`,
          }}
        >
          <MessageCircle className="h-7 w-7" />
        </Link>
      )}
    </div>
  );
}

export default function PatientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicBrandingProvider>
      <OfflineBanner />
      <PatientPortalLayoutInner>{children}</PatientPortalLayoutInner>
      <PWAUpdateBanner />
      <InstallPrompt />
    </ClinicBrandingProvider>
  );
}
