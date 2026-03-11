'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
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
  Watch,
  AlertCircle,
} from 'lucide-react';
import {
  ClinicBrandingProvider,
  useClinicBranding,
  usePortalFeatures,
} from '@/lib/contexts/ClinicBrandingContext';
import { logger } from '@/lib/logger';
import { UserAvatar } from '@/components/UserAvatar';
import {
  PatientPortalLanguageProvider,
  usePatientPortalLanguage,
} from '@/lib/contexts/PatientPortalLanguageContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { safeParseJsonString } from '@/lib/utils/safe-json';
import { safeParseJson } from '@/lib/utils/safe-json';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { isBrowser } from '@/lib/utils/ssr-safe';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';
import {
  NAV_MODULES,
  LEAD_NAV_MODULES,
  MOBILE_LABEL_OVERRIDE,
  LEAD_MOBILE_LABEL_OVERRIDE,
  getEnabledNavModuleIds,
  getNavModuleIdForPath,
  isPortalPath,
  getPortalMode,
} from '@/lib/patient-portal';
import type { PortalMode } from '@/lib/patient-portal';
import type { LucideIcon } from 'lucide-react';

const OfflineBanner = nextDynamic(
  () => import('@/components/PWAUpdateBanner').then((mod) => mod.OfflineBanner),
  { ssr: false },
);

const PWAUpdateBanner = nextDynamic(
  () => import('@/components/PWAUpdateBanner').then((mod) => mod.PWAUpdateBanner),
  { ssr: false },
);

const InstallPrompt = nextDynamic(
  () => import('@/components/PWAUpdateBanner').then((mod) => mod.InstallPrompt),
  { ssr: false },
);

// Icon mapping for nav (registry holds data; icons stay here for tree-shaking)
const NAV_ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  appointments: Calendar,
  'care-plan': HeartPulse,
  'care-team': MessageCircle,
  'health-score': Activity,
  progress: Scale,
  photos: Camera,
  achievements: Trophy,
  medications: Pill,
  shipments: Package,
  'symptom-checker': Activity,
  calculators: Calculator,
  resources: BookOpen,
  documents: BookOpen,
  billing: CreditCard,
  devices: Watch,
  settings: Settings,
  // Lead nav icons
  'lead-home': Home,
  'lead-intake': Activity,
  'lead-treatments': HeartPulse,
  'lead-specials': Scale,
  'lead-resources': BookOpen,
  'lead-settings': Settings,
};

function PatientPortalLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const features = usePortalFeatures();
  const { t } = usePatientPortalLanguage();

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [userData, setUserData] = useState<{ id?: number; role?: string; patientId?: number; firstName?: string; lastName?: string } | null>(null);
  const [displayName, setDisplayName] = useState<{ firstName: string; lastName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState(0);
  const [portalMode, setPortalMode] = useState<PortalMode>('patient');
  const [profileCompletionBanner, setProfileCompletionBanner] = useState<{ show: boolean; missingFields: string[] }>({ show: false, missingFields: [] });
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Memoize nav computation to prevent unnecessary re-renders (INP fix)
  const enabledNavIds = useMemo(
    () => getEnabledNavModuleIds(features, branding?.primaryTreatment),
    [features, branding?.primaryTreatment]
  );
  const activeModules = portalMode === 'lead' ? LEAD_NAV_MODULES : NAV_MODULES;
  const activeLabelOverrides = portalMode === 'lead' ? LEAD_MOBILE_LABEL_OVERRIDE : MOBILE_LABEL_OVERRIDE;

  const mainNavItems = useMemo(() => (portalMode === 'lead'
    ? [...activeModules]
    : activeModules.filter(
        (m) => (m.navSlot === 'main' || m.navSlot === 'both') && enabledNavIds.includes(m.id)
      )
  )
    .filter((m) => m.navSlot === 'main' || m.navSlot === 'both')
    .map((m) => ({
      icon: NAV_ICON_MAP[m.id] ?? Settings,
      path: `${PATIENT_PORTAL_PATH}${m.pathSuffix}`,
      labelKey: m.labelKey,
      exact: m.exact ?? false,
    })), [portalMode, activeModules, enabledNavIds]);

  const mobileNavItems = useMemo(() => (portalMode === 'lead'
    ? [...activeModules]
    : activeModules.filter(
        (m) => m.navSlot === 'both' && enabledNavIds.includes(m.id)
      )
  )
    .filter((m) => m.navSlot === 'both')
    .map((m) => ({
      icon: m.id === 'settings' || m.id === 'lead-settings' ? User : (NAV_ICON_MAP[m.id] ?? Settings),
      path: `${PATIENT_PORTAL_PATH}${m.pathSuffix}`,
      labelKey: activeLabelOverrides[m.id] ?? m.labelKey,
      exact: m.exact ?? false,
    })), [portalMode, activeModules, activeLabelOverrides, enabledNavIds]);

  // Check if chat should be shown
  const showChat = features.showChat !== false;

  // Chat page is a full-bleed experience with its own header/input;
  // hide layout chrome so it doesn't overlap or trap the user.
  const isChatPage = pathname === `${PATIENT_PORTAL_PATH}/chat` || pathname === '/patient-portal/chat';

  useEffect(() => {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('auth-token') || localStorage.getItem('patient-token');

    if (!user || !token) {
      setLoading(false);
      router.push(`/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=no_session`);
      return;
    }

    const data = safeParseJsonString<{ role?: string }>(user);
    if (!data) {
      localStorage.removeItem('user');
      localStorage.removeItem('auth-token');
      localStorage.removeItem('patient-token');
      setLoading(false);
      router.push(
        `/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=invalid_session`
      );
      return;
    }

    try {
      if (data.role?.toLowerCase() !== 'patient') {
        setLoading(false);
        router.push(
          `/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=invalid_role`
        );
        return;
      }

      setUserData(data);
    } catch {
      localStorage.removeItem('user');
      localStorage.removeItem('auth-token');
      localStorage.removeItem('patient-token');
      setLoading(false);
      router.push(
        `/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=invalid_session`
      );
      return;
    }

    setLoading(false);
  }, [router]);

  // Resolve display name from API when storage has minimal payload (no PHI in localStorage)
  useEffect(() => {
    if (!userData || userData.firstName) return;
    let cancelled = false;
    portalFetch('/api/auth/me')
      .then((res) => {
        if (!res.ok || cancelled) return;
        return safeParseJson(res);
      })
      .then((data) => {
        if (cancelled || !data || typeof data !== 'object' || !('user' in data)) return;
        const user = (data as { user?: { firstName?: string; lastName?: string } }).user;
        if (user?.firstName != null || user?.lastName != null) {
          setDisplayName({
            firstName: user.firstName ?? '',
            lastName: user.lastName ?? '',
          });
        }
      })
      .catch((err) => {
        logger.warn('Failed to fetch user display name', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [userData?.id]);

  // Fetch profile picture for avatar display
  useEffect(() => {
    if (!userData) return;
    let cancelled = false;
    portalFetch('/api/user/profile-picture')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.avatarUrl) setAvatarUrl(data.avatarUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userData?.id]);

  // Listen for avatar changes from settings page (or any child component)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ avatarUrl: string | null }>).detail;
      setAvatarUrl(detail.avatarUrl);
    };
    window.addEventListener('avatar-updated', handler);
    return () => window.removeEventListener('avatar-updated', handler);
  }, []);

  // Detect portal mode (lead vs patient) based on profile status
  useEffect(() => {
    if (!userData?.patientId) return;
    let cancelled = false;
    portalFetch('/api/patient-portal/profile/status')
      .then((res) => {
        if (!res.ok || cancelled) return;
        return safeParseJson(res);
      })
      .then((data) => {
        if (cancelled || !data || typeof data !== 'object') return;
        const d = data as {
          profileStatus?: string;
          hasCompletedIntake?: boolean;
          needsProfileCompletion?: boolean;
          missingFields?: string[];
        };
        const mode = getPortalMode(
          d.profileStatus ?? 'ACTIVE',
          d.hasCompletedIntake ?? true,
        );
        setPortalMode(mode);

        if (d.needsProfileCompletion && d.missingFields && d.missingFields.length > 0) {
          setProfileCompletionBanner({ show: true, missingFields: d.missingFields });
        }
      })
      .catch(() => {
        // Default to patient mode on error
      });
    return () => { cancelled = true; };
  }, [userData?.patientId]);

  // Route guard: redirect if user landed on a disabled module URL (e.g. bookmark)
  useEffect(() => {
    if (loading || brandingLoading || !pathname) return;
    if (!isPortalPath(pathname, PATIENT_PORTAL_PATH)) return;
    const moduleId = getNavModuleIdForPath(pathname, PATIENT_PORTAL_PATH);
    if (moduleId != null && !enabledNavIds.includes(moduleId)) {
      router.replace(PATIENT_PORTAL_PATH);
    }
  }, [pathname, loading, brandingLoading, enabledNavIds, router]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // White body background on mobile so top/bottom strips (safe areas) are white, not #efece7
  useEffect(() => {
    const isMobile =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
    if (!isMobile) return;
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#ffffff';
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('auth-token') || localStorage.getItem('patient-token');
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
    localStorage.removeItem('patient-token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_timestamp');
    window.location.href = '/patient-login';
  };

  const isActive = (path: string, exact?: boolean) => {
    const current = pathname?.startsWith('/patient-portal')
      ? pathname.replace('/patient-portal', PATIENT_PORTAL_PATH)
      : (pathname ?? '');
    if (exact) return current === path;
    return current === path || current.startsWith(path + '/');
  };

  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] overflow-x-hidden bg-white lg:bg-[#efece7]">
        {/* Desktop sidebar skeleton */}
        <aside className="fixed bottom-0 left-0 top-0 z-50 hidden w-20 flex-col border-r border-gray-200 bg-white py-4 lg:flex">
          <div className="mb-6 flex items-center justify-center px-4">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-gray-200" />
          </div>
          <nav className="flex flex-1 flex-col space-y-2 px-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-center rounded-xl px-3 py-2.5">
                <div className="h-5 w-5 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </nav>
        </aside>

        {/* Mobile header skeleton */}
        <header className="portal-header fixed left-0 right-0 top-0 z-50 bg-white lg:hidden">
          <div className="safe-top" />
          <div className="flex h-14 items-center justify-between px-4">
            <div className="h-8 w-[120px] animate-pulse rounded bg-gray-200" />
            <div className="flex items-center gap-1">
              <div className="h-11 w-11 animate-pulse rounded-xl bg-gray-100" />
              <div className="h-11 w-11 animate-pulse rounded-xl bg-gray-100" />
            </div>
          </div>
        </header>

        {/* Content skeleton */}
        <main className="min-w-0 flex-1 lg:ml-20">
          <div className="min-h-[100dvh] w-full pb-24 pt-[calc(56px+env(safe-area-inset-top,0px))] lg:pb-0 lg:pt-0">
            <div className="space-y-4 p-4 lg:p-6">
              <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200" />
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* Mobile bottom nav skeleton */}
        <nav className="portal-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white lg:hidden">
          <div className="border-t border-gray-200">
            <div className="mx-auto flex max-w-md justify-around gap-1 px-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-1 flex-col items-center py-2">
                  <div className="h-11 w-11 animate-pulse rounded-2xl bg-gray-100" />
                  <div className="mt-0.5 h-2.5 w-8 animate-pulse rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="safe-bottom bg-white" />
        </nav>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] overflow-x-hidden" style={{ backgroundColor: `${primaryColor}0A` }}>
      {/* Desktop Sidebar - Hidden on mobile */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 hidden flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 lg:flex ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        <div className="mb-6 flex items-center justify-center px-4">
          <Link href={PATIENT_PORTAL_PATH}>
            <img
              src={
                sidebarExpanded
                  ? branding?.logoUrl || EONPRO_LOGO
                  : branding?.iconUrl || branding?.faviconUrl || branding?.logoUrl || EONPRO_LOGO
              }
              alt={branding?.clinicName || 'EONPRO'}
              width={sidebarExpanded ? 140 : 40}
              height={40}
              className={`${sidebarExpanded ? 'h-10 w-auto max-w-[140px]' : 'h-10 w-10 rounded-lg'} object-contain`}
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
                title={!sidebarExpanded ? t(item.labelKey) : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  active ? 'text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: primaryColor } : {}}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="whitespace-nowrap text-sm font-medium">{t(item.labelKey)}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-gray-100 px-3 pt-4">
          {userData && (
            <Link
              href={`${PATIENT_PORTAL_PATH}/settings`}
              className="flex items-center gap-3 rounded-xl px-3 py-2 transition-all hover:bg-gray-50"
              title={sidebarExpanded ? undefined : 'Profile'}
            >
              <UserAvatar
                avatarUrl={avatarUrl}
                firstName={displayName?.firstName || userData.firstName || ''}
                lastName={displayName?.lastName || userData.lastName || ''}
                size="sm"
              />
              {sidebarExpanded && (
                <span className="min-w-0 truncate text-xs font-medium text-gray-700">
                  {displayName
                    ? `${displayName.firstName} ${displayName.lastName}`.trim() || 'Patient'
                    : (userData.firstName || userData.lastName)
                      ? `${userData.firstName ?? ''} ${userData.lastName ?? ''}`.trim()
                      : 'Patient'}
                </span>
              )}
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title={!sidebarExpanded ? t('navSignOut') : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarExpanded && (
              <span className="whitespace-nowrap text-sm font-medium">{t('navSignOut')}</span>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Header - Optimized for iPhone notch (hidden on chat page) */}
      <header className={`portal-header fixed left-0 right-0 top-0 z-50 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] lg:hidden ${isChatPage ? 'hidden' : ''}`}>
        <div className="safe-top" />
        <div className="flex h-14 items-center justify-between px-4">
          <Link href={PATIENT_PORTAL_PATH} className="flex items-center gap-3">
            <img
              src={branding?.logoUrl || EONPRO_LOGO}
              alt={branding?.clinicName || 'EONPRO'}
              width={120}
              height={32}
              fetchPriority="high"
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
            {/* Avatar / Menu toggle - 44x44 touch target */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : avatarUrl || displayName || userData?.firstName ? (
                <UserAvatar
                  avatarUrl={avatarUrl}
                  firstName={displayName?.firstName || userData?.firstName || ''}
                  lastName={displayName?.lastName || userData?.lastName || ''}
                  size="sm"
                />
              ) : (
                <Menu className="h-6 w-6" />
              )}
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
          <div className="fixed bottom-0 right-0 top-0 z-50 flex w-72 flex-col bg-white shadow-2xl lg:hidden">
            <div className="safe-top" />
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-4">
              <span className="text-lg font-semibold text-gray-900">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 active:bg-gray-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path, item.exact);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-4 rounded-2xl px-4 py-4 transition-colors active:scale-[0.98] ${
                      active ? 'text-white' : 'text-gray-700 active:bg-gray-100'
                    }`}
                    style={active ? { backgroundColor: primaryColor } : {}}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-base font-semibold">{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="shrink-0 border-t border-gray-100 bg-gray-50 p-3">
              <div className="safe-bottom">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-red-50 px-4 py-4 text-red-600 active:bg-red-100"
                >
                  <LogOut className="h-6 w-6" />
                  <span className="text-base font-semibold">{t('navSignOut')}</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main Content Area */}
      <main
        className={`min-w-0 flex-1 overflow-x-hidden transition-all duration-300 lg:ml-20 ${sidebarExpanded ? 'lg:ml-56' : ''}`}
      >
        <div className={`min-h-[100dvh] w-full max-w-[100vw] min-w-0 overflow-x-hidden lg:max-w-none ${isChatPage ? 'pb-0 pt-0 lg:pb-0 lg:pt-0' : 'pb-24 pt-[calc(56px+env(safe-area-inset-top,0px))] lg:pb-0 lg:pt-0'}`}>
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation - iPhone optimized */}
      <nav className={`portal-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white lg:hidden`}>
        <div className="border-t border-gray-200">
          <div className="mx-auto flex max-w-md justify-around gap-1 px-1">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path, item.exact);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className="group relative flex min-w-0 flex-1 flex-col items-center py-2"
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
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors ${
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
                  {/* Label - truncate so long text (e.g. Medicamentos) fits */}
                  <span
                    className={`mt-0.5 min-w-0 max-w-full truncate px-0.5 text-center text-[10px] sm:text-[11px] ${active ? 'font-semibold' : 'font-medium'}`}
                    style={{ color: active ? primaryColor : '#9ca3af' }}
                  >
                    {t(item.labelKey)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
        {/* Safe area for home indicator */}
        <div className="safe-bottom bg-white" />
      </nav>

      {/* Profile completion banner — fixed toast to avoid CLS from content push-down */}
      {profileCompletionBanner.show && !bannerDismissed && !isChatPage && (
        <div className="fixed left-4 right-4 top-[calc(56px+env(safe-area-inset-top,0px)+8px)] z-40 lg:left-24 lg:right-6 lg:top-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-lg">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                Please complete your profile
              </p>
              <p className="mt-0.5 text-sm text-amber-700">
                Your {profileCompletionBanner.missingFields.map(f =>
                  f === 'dateOfBirth' ? 'date of birth' : f
                ).join(' and ')} {profileCompletionBanner.missingFields.length === 1 ? 'is' : 'are'} missing.
              </p>
              <Link
                href={`${PATIENT_PORTAL_PATH}/settings`}
                className="mt-1 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                style={{ color: primaryColor }}
              >
                Go to Settings
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="flex-shrink-0 text-amber-400 hover:text-amber-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Chat Button - Above bottom nav on mobile (hidden when already on chat) */}
      {showChat && !isChatPage && (
        <Link
          href={`${PATIENT_PORTAL_PATH}/chat`}
          className="portal-chat-fab fixed z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-transform active:scale-95 lg:bottom-6 lg:right-6"
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
      <PatientPortalLanguageProvider>
        <OfflineBanner />
        <PatientPortalLayoutInner>{children}</PatientPortalLayoutInner>
        <PWAUpdateBanner />
        <InstallPrompt />
      </PatientPortalLanguageProvider>
    </ClinicBrandingProvider>
  );
}
