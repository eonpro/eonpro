'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Users,
  Calendar,
  MessageSquare,
  FileText,
  TestTube,
  Pill,
  BookOpen,
  Settings,
  LogOut,
  ChevronRight,
  Search,
  Activity,
  Stethoscope,
  ClipboardList,
  Bell,
  Ticket,
} from 'lucide-react';
import InternalChat from '@/components/InternalChat';
import {
  NotificationProvider,
  NotificationCenter,
  NotificationToastContainer,
} from '@/components/notifications';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { SubdomainClinicBanner } from '@/components/SubdomainClinicBanner';
import { apiFetch } from '@/lib/api/fetch';

// Default EONPRO logos
const EONPRO_LOGO =
  'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';
const EONPRO_ICON =
  'https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png';

const mainNavItems = [
  { icon: Home, path: '/provider', label: 'Dashboard', exact: true },
  { icon: Users, path: '/provider/patients', label: 'My Patients' },
  { icon: ClipboardList, path: '/provider/prescription-queue', label: 'Rx Queue', hasBadge: true },
  { icon: Calendar, path: '/provider/calendar', label: 'Calendar' },
  { icon: Stethoscope, path: '/provider/consultations', label: 'Consultations' },
  { icon: Pill, path: '/provider/prescriptions', label: 'Prescriptions' },
  { icon: TestTube, path: '/provider/labs', label: 'Lab Results' },
  { icon: FileText, path: '/provider/soap-notes', label: 'SOAP Notes' },
  { icon: MessageSquare, path: '/provider/messages', label: 'Messages' },
  { icon: Ticket, path: '/tickets', label: 'Tickets' },
  { icon: BookOpen, path: '/provider/resources', label: 'Resources' },
  { icon: Settings, path: '/provider/settings', label: 'Settings' },
];

const clinicalTools = [
  { icon: BookOpen, path: '/provider/drug-reference', label: 'Drug Reference' },
  { icon: Search, path: '/provider/icd-lookup', label: 'ICD-10 Lookup' },
  { icon: Activity, path: '/provider/calculators', label: 'Medical Calculators' },
];

function ProviderLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState<number | null>(null);
  const [rxQueueCount, setRxQueueCount] = useState(0);

  // Get branding colors with fallbacks
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const clinicLogo = branding?.logoUrl || EONPRO_LOGO;
  const clinicIcon = branding?.iconUrl || EONPRO_ICON;
  const clinicName = branding?.clinicName || 'EONPRO';
  const isWhiteLabeled = branding?.clinicName && branding.clinicName !== 'EONPRO';

  // Fetch prescription queue count
  const fetchQueueCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
      if (!token) return;

      const response = await apiFetch('/api/provider/prescription-queue/count', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setRxQueueCount(data.count || 0);
      }
    } catch (err) {
      console.error('Error fetching queue count:', err);
    }
  }, []);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(user);
      const role = parsedUser.role?.toLowerCase();
      if (role !== 'provider') {
        router.push('/login');
        return;
      }
      // Build display name from firstName/lastName or fallback to name field
      const displayName =
        parsedUser.firstName && parsedUser.lastName
          ? `${parsedUser.firstName} ${parsedUser.lastName}`
          : parsedUser.name || parsedUser.email?.split('@')[0] || '';
      setUserName(`Dr. ${displayName}`.trim());
      // Ensure userId is always a number (might be string from localStorage)
      setUserId(parsedUser.id ? Number(parsedUser.id) : null);
      setLoading(false);

      // Fetch queue count after auth check
      fetchQueueCount();
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router, fetchQueueCount]);

  // Refresh queue count periodically and when pathname changes
  useEffect(() => {
    if (!loading) {
      fetchQueueCount();
    }

    // Refresh every 30 seconds
    const interval = setInterval(fetchQueueCount, 30000);
    return () => clearInterval(interval);
  }, [pathname, loading, fetchQueueCount]);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
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
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });
    window.location.href = '/login';
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return pathname === path;
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
          <Link href="/provider">
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

        {/* Main Navigation */}
        <nav className="flex flex-1 flex-col space-y-1 overflow-y-auto px-3">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path, item.exact);
            const showBadge = item.hasBadge && rxQueueCount > 0;

            // Use button with direct navigation for reliability
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
                title={
                  !sidebarExpanded
                    ? `${item.label}${showBadge ? ` (${rxQueueCount})` : ''}`
                    : undefined
                }
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                  active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
              >
                <div className="relative">
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {showBadge && !sidebarExpanded && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                      {rxQueueCount > 99 ? '99+' : rxQueueCount}
                    </span>
                  )}
                </div>
                {sidebarExpanded && (
                  <span className="flex-1 whitespace-nowrap text-sm font-medium">{item.label}</span>
                )}
                {sidebarExpanded && showBadge && (
                  <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1.5 text-xs font-bold text-white">
                    {rxQueueCount > 99 ? '99+' : rxQueueCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Clinical Tools Section */}
          {sidebarExpanded && (
            <div className="mt-6 border-t border-gray-100 pt-6">
              <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Clinical Tools
              </p>
              {clinicalTools.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      if (active) {
                        window.location.reload();
                      } else {
                        window.location.href = item.path;
                      }
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all ${
                      active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                    style={
                      active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Collapsed Clinical Tools */}
          {!sidebarExpanded && (
            <div className="mt-6 space-y-1 border-t border-gray-100 pt-6">
              {clinicalTools.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      if (active) {
                        window.location.reload();
                      } else {
                        window.location.href = item.path;
                      }
                    }}
                    title={item.label}
                    className={`flex w-full items-center justify-center rounded-xl p-2.5 transition-all ${
                      active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                    style={
                      active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* User Info & Logout */}
        <div className="space-y-2 border-t border-gray-100 px-3 pt-4">
          {sidebarExpanded && userName && (
            <div className="truncate px-3 py-2 text-xs text-gray-500">{userName}</div>
          )}
          <button
            type="button"
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

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarExpanded ? 'ml-56' : 'ml-20'}`}>
        {/* Top Left Notification Bar */}
        <div className="sticky top-0 z-40 border-b border-gray-200/50 bg-[#efece7]/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <NotificationCenter
                notificationsPath="/provider/notifications"
                dropdownPosition="left"
              />
              <span className="text-sm font-medium text-gray-600">Notifications</span>
            </div>
          </div>
        </div>

        {children}
      </main>

      {/* Internal Team Chat */}
      {userId && <InternalChat currentUserId={userId} currentUserRole="provider" />}
    </div>
  );
}

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicBrandingProvider>
      <NotificationProvider>
        <SubdomainClinicBanner />
        <ProviderLayoutInner>{children}</ProviderLayoutInner>
        <NotificationToastContainer />
      </NotificationProvider>
    </ClinicBrandingProvider>
  );
}
