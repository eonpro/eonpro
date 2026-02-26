'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import { normalizedIncludes } from '@/lib/utils/search';
import {
  Home,
  Users,
  ShoppingCart,
  Store,
  TrendingUp,
  DollarSign,
  Settings,
  LogOut,
  Clock,
  ChevronRight,
  ChevronDown,
  UserPlus,
  UserCheck,
  CreditCard,
  RefreshCw,
  FileText,
  Key,
  Pill,
  Ticket,
  BarChart3,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { apiFetch, dispatchSessionExpired } from '@/lib/api/fetch';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { USMapChart } from '@/components/dashboards/USMapChart';
import { EONPRO_LOGO, EONPRO_ICON } from '@/lib/constants/brand-assets';

interface PatientIntake {
  id: number;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  tags: string[];
  createdAt: string;
}

interface DashboardStats {
  newIntakes: number;
  newRevenue: number;
  recurringRevenue: number;
  newPrescriptions: number;
  /** Sales rep only: commissions earned in cents */
  commissionsEarnedCents?: number;
}

interface DailyScriptBucket {
  date: string;
  total: number;
  medications: Record<string, number>;
  statuses: Record<string, number>;
}

interface DailyScriptsData {
  days: DailyScriptBucket[];
  grandTotal: number;
  topMedications: Array<{ name: string; count: number }>;
  range: { from: string; to: string; days: number };
}

// Match order and items from lib/nav/adminNav (baseAdminNavConfig) for consistent sidebar
const navItems = [
  { icon: Home, path: '/', label: 'Home', active: true },
  { icon: UserPlus, path: '/admin/intakes', label: 'Intakes' },
  { icon: Users, path: '/admin/patients', label: 'Patients' },
  { icon: MessageSquare, path: '/admin/messages', label: 'Messages' },
  { icon: Pill, path: '/admin/rx-queue', label: 'RX Queue' },
  { icon: ShoppingCart, path: '/admin/orders', label: 'Orders' },
  { icon: Ticket, path: '/tickets', label: 'Tickets' },
  { icon: Store, path: '/admin/products', label: 'Products' },
  { icon: TrendingUp, path: '/admin/analytics', label: 'Analytics' },
  { icon: DollarSign, path: '/admin/sales-rep/commission-plans', label: 'Sales Rep Commissions' },
  { icon: UserCheck, path: '/admin/affiliates', label: 'Affiliates' },
  { icon: DollarSign, path: '/admin/finance', label: 'Finance' },
  { icon: CreditCard, path: '/admin/stripe-dashboard', label: 'Stripe' },
  { icon: Key, path: '/admin/registration-codes', label: 'Registration Codes' },
  { icon: Settings, path: '/admin/settings', label: 'Settings' },
];

function HomePageInner() {
  const router = useRouter();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [systemStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentIntakes, setRecentIntakes] = useState<PatientIntake[]>([]);
  const [intakesLoading, setIntakesLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    newIntakes: 0,
    newRevenue: 0,
    recurringRevenue: 0,
    newPrescriptions: 0,
    commissionsEarnedCents: 0,
  });
  const [geoData, setGeoData] = useState<{
    stateData: Record<string, { total: number; clinics: Array<{ clinicId: number; clinicName: string; color: string; count: number }> }>;
    clinics: Array<{ id: number; name: string; color: string; totalPatients: number }>;
  } | null>(null);
  const [geoLoading, setGeoLoading] = useState(true);
  const [scriptsBreakdown, setScriptsBreakdown] = useState<DailyScriptsData | null>(null);
  const [scriptsBreakdownLoading, setScriptsBreakdownLoading] = useState(false);
  const [scriptsBreakdownOpen, setScriptsBreakdownOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Get branding colors with fallbacks
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const clinicLogo = branding?.logoUrl || EONPRO_LOGO;
  const clinicIcon = branding?.iconUrl || EONPRO_ICON;
  const clinicName = branding?.clinicName || 'EONPRO';
  const isWhiteLabeled = branding?.clinicName && branding.clinicName !== 'EONPRO';

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      // Step 1: Try the server-side session first (cookie auth).
      // This is the source of truth and prevents stale localStorage data
      // (e.g. an old affiliate session) from hijacking the redirect.
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        if (meRes.ok) {
          const meData = await meRes.json();
          const serverRole = meData.user?.role?.toLowerCase();
          const tokenSource = meRes.headers.get('x-auth-token-source');

          if (serverRole === 'affiliate') {
            // STALE SESSION DETECTION:
            // The root page (/) is the admin dashboard. When we detect an affiliate session here,
            // it's often because the admin's auth-token expired but the 30-day affiliate_session
            // cookie remained. The auth middleware falls back to affiliate_session and returns
            // role=affiliate, causing an unwanted redirect.
            //
            // Detection heuristics:
            // 1. Server tells us the token came from 'affiliate_session' fallback cookie
            // 2. localStorage contains a non-affiliate role from a previous admin/provider session
            const isStaleAffiliateSession = tokenSource === 'affiliate_session' || tokenSource === 'affiliate-token';

            let previousRole: string | null = null;
            try {
              const storedUser = localStorage.getItem('user');
              if (storedUser) {
                previousRole = JSON.parse(storedUser)?.role?.toLowerCase();
              }
            } catch {}

            const hadDifferentRole = previousRole && previousRole !== 'affiliate' &&
              ['admin', 'super_admin', 'provider', 'staff', 'support'].includes(previousRole);

            if (isStaleAffiliateSession || hadDifferentRole) {
              console.warn(
                `[Auth] Stale affiliate session redirect blocked on root page. ` +
                `Server role="${serverRole}", tokenSource="${tokenSource || 'unknown'}", ` +
                `localStorage role="${previousRole || 'none'}". ` +
                `Likely cause: admin session expired while 30-day affiliate cookie remained.`
              );
              // Clear the stale affiliate session cookie via logout
              fetch('/api/affiliate/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
              localStorage.removeItem('user');
              localStorage.removeItem('auth-token');
              localStorage.removeItem('admin-token');
              localStorage.removeItem('access_token');
              localStorage.removeItem('refresh_token');
              router.push('/login?reason=session_expired&stale_session=affiliate');
              return;
            }

            router.push('/affiliate');
            return;
          }
          if (serverRole === 'patient') {
            router.push(PATIENT_PORTAL_PATH);
            return;
          }
          if (serverRole === 'provider') {
            router.push('/provider');
            return;
          }
          if (serverRole === 'staff') {
            router.push('/staff');
            return;
          }
          if (serverRole === 'super_admin') {
            router.push('/super-admin');
            return;
          }

          // Admin — show dashboard
          setUserData(meData.user);
          setLoading(false);
          loadDashboardData();
          return;
        }
      } catch {
        // /api/auth/me failed (network error, etc.) — fall through to localStorage
      }

      // Step 2: Fallback to localStorage when cookie session is absent
      const user = localStorage.getItem('user');
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const parsedUser = JSON.parse(user);
        const role = parsedUser.role?.toLowerCase();

        if (role === 'affiliate') {
          // Verify affiliate session is still valid
          try {
            const res = await apiFetch('/api/affiliate/auth/me', { credentials: 'include' });
            if (res.ok) {
              router.push('/affiliate');
            } else {
              localStorage.removeItem('user');
              localStorage.removeItem('auth-token');
              router.push('/login');
            }
          } catch {
            localStorage.removeItem('user');
            localStorage.removeItem('auth-token');
            router.push('/login');
          }
          return;
        }
        if (role === 'patient') {
          router.push(PATIENT_PORTAL_PATH);
          return;
        }
        if (role === 'provider') {
          router.push('/provider');
          return;
        }
        if (role === 'staff') {
          router.push('/staff');
          return;
        }
        if (role === 'super_admin') {
          router.push('/super-admin');
          return;
        }

        setUserData(parsedUser);
        setLoading(false);
        loadDashboardData();
      } catch {
        localStorage.removeItem('user');
        router.push('/login');
      }
    };

    checkAuthAndRedirect();
  }, [router]);

  /**
   * Fetch with retry for transient 503 errors (DB connection pool exhaustion).
   * Retries up to 2 times with exponential backoff, respecting Retry-After header.
   */
  const fetchWithRetry = async (url: string, maxRetries = 2): Promise<Response> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await apiFetch(url);

      if (response.status === 503 && attempt < maxRetries) {
        // Respect Retry-After header or default to exponential backoff
        const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
        const delay = retryAfter > 0 ? retryAfter * 1000 : 1000 * Math.pow(2, attempt);
        console.warn(`[Dashboard] ${url} returned 503, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    }

    // Should never reach here, but return last attempt
    return apiFetch(url);
  };

  const loadDashboardData = async () => {
    try {
      let isSalesRep = false;
      try {
        const user = localStorage.getItem('user');
        if (user) {
          const parsed = JSON.parse(user);
          isSalesRep = parsed?.role?.toLowerCase() === 'sales_rep';
        }
      } catch {
        // ignore
      }

      if (isSalesRep) {
        // Sales rep: only assigned-patient stats and commissions (no orders, no clinic-wide revenue)
        try {
          const [statsResponse, patientsResponse] = await Promise.all([
            fetchWithRetry('/api/sales-rep/stats'),
            fetchWithRetry('/api/admin/patients?limit=100&includeContact=true'),
          ]);
          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            setStats((prev) => ({
              ...prev,
              newIntakes: statsData.assignedPatientCount ?? 0,
              newRevenue: 0,
              recurringRevenue: 0,
              newPrescriptions: 0,
              commissionsEarnedCents: statsData.commissionsEarnedCents ?? 0,
            }));
          }
          if (patientsResponse.ok) {
            const patientsData = await patientsResponse.json();
            const patients = patientsData.patients || [];
            setRecentIntakes(patients);
          }
        } catch (e: any) {
          if (e.isAuthError) throw e;
          console.warn('[Dashboard] Sales rep stats fetch failed:', e.message);
        } finally {
          setIntakesLoading(false);
          setGeoLoading(false);
        }
        return;
      }

      // Stagger API calls to reduce concurrent DB connection pressure.
      // 1. Fetch recent patient intakes (most important for dashboard)
      try {
        const intakesResponse = await fetchWithRetry(
          '/api/patients?limit=100&recent=24h&includeContact=true'
        );
        if (intakesResponse.ok) {
          const intakesData = await intakesResponse.json();
          const patients = intakesData.patients || [];
          setRecentIntakes(patients);
          setStats((prev) => ({
            ...prev,
            newIntakes: intakesData.total ?? patients.length,
          }));
        }
      } catch (e: any) {
        if (e.isAuthError) throw e;
        console.warn('[Dashboard] Patients fetch failed:', e.message);
      }

      // 2. Fetch revenue stats (staggered after patients)
      try {
        const metricsResponse = await fetchWithRetry('/api/finance/metrics?range=7d');
        if (metricsResponse.ok) {
          const metricsData = await metricsResponse.json();
          const newRevenue = (metricsData.grossRevenue || 0) / 100;
          const recurringRevenue = (metricsData.mrr || 0) / 100;
          setStats((prev) => ({ ...prev, newRevenue, recurringRevenue }));
        }
      } catch (e: any) {
        if (e.isAuthError) throw e;
        console.warn('[Dashboard] Finance metrics fetch failed:', e.message);
      }

      // 3. Fetch prescriptions/scripts count (staggered after metrics)
      try {
        const ordersResponse = await fetchWithRetry('/api/orders?limit=1&recent=24h');
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          setStats((prev) => ({ ...prev, newPrescriptions: ordersData.total ?? 0 }));
        }
      } catch (e: any) {
        if (e.isAuthError) throw e;
        console.warn('[Dashboard] Orders fetch failed:', e.message);
      }

      // 3b. Fetch daily scripts breakdown (14-day window)
      try {
        setScriptsBreakdownLoading(true);
        const dailyResponse = await fetchWithRetry('/api/orders/stats/daily?days=14');
        if (dailyResponse.ok) {
          const dailyData = await dailyResponse.json();
          setScriptsBreakdown(dailyData);
        }
      } catch (e: any) {
        if (e.isAuthError) throw e;
        console.warn('[Dashboard] Daily scripts fetch failed:', e.message);
      } finally {
        setScriptsBreakdownLoading(false);
      }

      // 4. Fetch geographic data for the map (non-blocking)
      try {
        const geoResponse = await fetchWithRetry('/api/admin/dashboard/geo');
        if (geoResponse.ok) {
          const geoPayload = await geoResponse.json();
          setGeoData(geoPayload);
        }
      } catch (e: any) {
        if (e.isAuthError) throw e;
        console.warn('[Dashboard] Geo data fetch failed:', e.message);
      } finally {
        setGeoLoading(false);
      }

      setIntakesLoading(false);
    } catch (error: any) {
      if (error.isAuthError) return;
      console.error('Failed to load dashboard data:', error);
      setIntakesLoading(false);
      setGeoLoading(false);
    }
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const formatGender = (gender: string | null | undefined) => {
    if (!gender) return '';
    const g = gender.toLowerCase().trim();
    if (g === 'f' || g === 'female' || g === 'woman') return 'Female';
    if (g === 'm' || g === 'male' || g === 'man') return 'Male';
    return gender;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const filteredIntakes = recentIntakes
    .filter((patient) => {
      if (!searchQuery) return true;
      return (
        normalizedIncludes(patient.firstName || '', searchQuery) ||
        normalizedIncludes(patient.lastName || '', searchQuery) ||
        normalizedIncludes(patient.email || '', searchQuery) ||
        normalizedIncludes(patient.phone || '', searchQuery) ||
        normalizedIncludes(patient.id?.toString() || '', searchQuery)
      );
    })
    .slice(0, 8); // Limit to 8 items

  if (loading || brandingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <img src={EONPRO_ICON} alt="Loading" className="h-12 w-12 animate-pulse object-contain" />
      </div>
    );
  }

  const displayName = userData?.firstName || userData?.email?.split('@')[0] || 'there';

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
            return (
              <Link
                key={item.path}
                href={item.path}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  item.active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={
                  item.active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}
                }
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
        <div className="p-8">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            {/* Left: Status & Time */}
            <div>
              <div className="mb-1 flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      systemStatus === 'healthy'
                        ? primaryColor
                        : systemStatus === 'warning'
                          ? '#f59e0b'
                          : '#ef4444',
                  }}
                />
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  SYSTEM: {systemStatus.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-800">
                {currentTime.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <p className="text-sm text-gray-600">
                {currentTime
                  .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                  .toLowerCase()}
              </p>
            </div>

            {/* Right: Search — filters table below; Enter opens full patient search */}
            <div className="relative w-96">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const q = searchQuery.trim();
                    const url = q
                      ? `/admin/patients?search=${encodeURIComponent(q)}`
                      : '/admin/patients';
                    router.push(url);
                  }
                }}
                placeholder="Search patients (Enter for full search)"
                className="w-full rounded-full border border-gray-200 bg-white py-3 pl-4 pr-4 text-sm transition-all focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${primaryColor}33` } as React.CSSProperties}
                aria-label="Search patients"
              />
            </div>
          </div>

          {/* Welcome */}
          <h1 className="mb-6 text-3xl font-semibold text-gray-900">
            Welcome, <span className="text-gray-900">{displayName}</span>
          </h1>

          {/* Stats Cards */}
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {userData?.role?.toLowerCase() === 'sales_rep' ? (
              <>
                {/* Assigned profiles (sales rep only) */}
                <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <Users className="h-6 w-6" style={{ color: primaryColor }} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">{stats.newIntakes}</p>
                    <p className="text-sm text-gray-500">Assigned profiles</p>
                  </div>
                </div>
                {/* Commissions earned (sales rep only) */}
                <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
                    <DollarSign className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {formatCurrency((stats.commissionsEarnedCents ?? 0) / 100)}
                    </p>
                    <p className="text-sm text-gray-500">Commissions earned</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Intakes (24h) */}
                <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <UserPlus className="h-6 w-6" style={{ color: primaryColor }} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">{stats.newIntakes}</p>
                    <p className="text-sm text-gray-500">Intakes (24h)</p>
                  </div>
                </div>
                {/* Revenue (7 days) */}
                <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <CreditCard className="h-6 w-6" style={{ color: primaryColor }} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {formatCurrency(stats.newRevenue)}
                    </p>
                    <p className="text-sm text-gray-500">Revenue (7 days)</p>
                  </div>
                </div>
                {/* Recurring Revenue */}
                <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
                    <RefreshCw className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {formatCurrency(stats.recurringRevenue)}
                    </p>
                    <p className="text-sm text-gray-500">Recurring</p>
                  </div>
                </div>
                {/* Scripts (24h) — clickable to toggle breakdown */}
                <button
                  onClick={() => setScriptsBreakdownOpen((prev) => !prev)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left transition-colors hover:border-rose-300 hover:bg-rose-50/30"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10">
                    <FileText className="h-6 w-6 text-rose-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-3xl font-bold text-gray-900">{stats.newPrescriptions.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">Scripts (24h)</p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform ${scriptsBreakdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </>
            )}
          </div>

          {/* Scripts Daily Breakdown (expandable) */}
          {scriptsBreakdownOpen && userData?.role?.toLowerCase() !== 'sales_rep' && (
            <div className="mb-8 rounded-2xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10">
                    <BarChart3 className="h-5 w-5 text-rose-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Scripts Breakdown</h3>
                    <p className="text-xs text-gray-500">
                      {scriptsBreakdown
                        ? `${scriptsBreakdown.grandTotal.toLocaleString()} total scripts in the last ${scriptsBreakdown.range.days} days`
                        : 'Loading...'}
                    </p>
                  </div>
                </div>
              </div>

              {scriptsBreakdownLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-rose-500" />
                </div>
              ) : scriptsBreakdown ? (
                <div className="divide-y divide-gray-50">
                  {/* Top Medications Summary */}
                  {scriptsBreakdown.topMedications.length > 0 && (
                    <div className="px-6 py-4">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
                        Top Medications ({scriptsBreakdown.range.days}d)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {scriptsBreakdown.topMedications.slice(0, 10).map((med) => (
                          <span
                            key={med.name}
                            className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                          >
                            <Pill className="h-3 w-3 text-gray-400" />
                            {med.name}
                            <span className="ml-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                              {med.count}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Daily Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left">
                          <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-400">
                            Date
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">
                            Scripts
                          </th>
                          <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-400">
                            Medications
                          </th>
                          <th className="w-10 px-3 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {scriptsBreakdown.days.map((day) => {
                          const isExpanded = expandedDay === day.date;
                          const medEntries = Object.entries(day.medications).sort(
                            (a, b) => b[1] - a[1]
                          );
                          const statusEntries = Object.entries(day.statuses).sort(
                            (a, b) => b[1] - a[1]
                          );
                          const dateObj = new Date(day.date + 'T12:00:00');
                          const formattedDate = dateObj.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          });

                          return (
                            <tr
                              key={day.date}
                              className="group border-b border-gray-50 last:border-0"
                            >
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-3.5 w-3.5 text-gray-300" />
                                  <span className="font-medium text-gray-900">{formattedDate}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <span
                                  className={`text-lg font-bold ${day.total > 0 ? 'text-gray-900' : 'text-gray-300'}`}
                                >
                                  {day.total.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-3">
                                {medEntries.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {medEntries.slice(0, isExpanded ? undefined : 3).map(([med, count]) => (
                                      <span
                                        key={med}
                                        className="inline-flex items-center rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
                                      >
                                        {med}{' '}
                                        <span className="ml-1 font-semibold text-gray-900">
                                          {count}
                                        </span>
                                      </span>
                                    ))}
                                    {!isExpanded && medEntries.length > 3 && (
                                      <span className="text-xs text-gray-400">
                                        +{medEntries.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {medEntries.length > 3 && (
                                  <button
                                    onClick={() =>
                                      setExpandedDay(isExpanded ? null : day.date)
                                    }
                                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                  >
                                    <ChevronDown
                                      className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                  No data available
                </div>
              )}
            </div>
          )}

          {/* US Map - Client Distribution (hidden for sales rep; they see assigned-only stats) */}
          {userData?.role?.toLowerCase() !== 'sales_rep' && (
            <div className="mb-8">
              <USMapChart
                stateData={geoData?.stateData ?? {}}
                clinics={geoData?.clinics ?? []}
                isLoading={geoLoading}
              />
            </div>
          )}

          {/* Patient Intakes Card */}
          <div className="rounded-2xl border border-gray-200 bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {userData?.role?.toLowerCase() === 'sales_rep'
                  ? 'My assigned patients'
                  : 'Patient Intakes (Last 24 Hours)'}
              </h2>
              <Link
                href="/admin/patients"
                className="text-sm font-medium text-gray-500 hover:opacity-80"
                style={{ color: primaryColor }}
              >
                Load More
              </Link>
            </div>

            {/* Search */}
            <div className="px-6 pb-4">
              <input
                type="text"
                placeholder="Search patients by name, email, phone, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${primaryColor}33` } as React.CSSProperties}
              />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {intakesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <img src={EONPRO_ICON} alt="Loading" className="h-8 w-8 animate-pulse object-contain" />
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-t border-gray-100">
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        DOB
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Contact
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredIntakes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-16 text-center">
                          <Clock className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                          <p className="font-medium text-gray-500">
                            No patient intakes in the last 24 hours
                          </p>
                          <p className="mt-1 text-sm text-gray-400">
                            New intakes will appear here automatically
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredIntakes.map((patient) => (
                        <tr
                          key={patient.id}
                          className="cursor-pointer transition-colors hover:bg-gray-50/50 focus:bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
                          tabIndex={0}
                          role="link"
                          onClick={() => {
                            window.location.href = `/patients/${patient.id}`;
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = `/patients/${patient.id}`; }}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="h-2 w-2 flex-shrink-0 rounded-full"
                                style={{
                                  backgroundColor:
                                    new Date(patient.createdAt).getTime() > Date.now() - 3600000
                                      ? primaryColor
                                      : '#fbbf24',
                                }}
                              />
                              <div>
                                <Link
                                  href={`/patients/${patient.id}`}
                                  className="font-medium text-gray-900 hover:opacity-80"
                                  style={{ '--hover-color': primaryColor } as React.CSSProperties}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {patient.firstName} {patient.lastName}
                                </Link>
                                <p className="text-xs text-gray-400">
                                  #{formatPatientDisplayId(patient.patientId, patient.id)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-600">
                              {formatDate(patient.dateOfBirth)}
                            </p>
                            <p className="text-xs text-gray-400">
                              ({formatGender(patient.gender)})
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-600">
                              {patient.phone && patient.phone.replace(/\D/g, '') !== '0000000000'
                                ? patient.phone
                                : '—'}
                            </p>
                            <p className="max-w-[180px] truncate text-xs text-gray-400">
                              {patient.email || 'N/A'}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              href={`/patients/${patient.id}`}
                              className="text-sm font-medium hover:opacity-80"
                              style={{ color: primaryColor }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              View profile
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <ClinicBrandingProvider>
      <HomePageInner />
    </ClinicBrandingProvider>
  );
}
