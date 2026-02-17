'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import {
  Home,
  Users,
  ShoppingCart,
  Store,
  TrendingUp,
  DollarSign,
  Settings,
  LogOut,
  Search,
  Clock,
  ChevronRight,
  UserPlus,
  UserCheck,
  CreditCard,
  RefreshCw,
  FileText,
  Key,
  Pill,
  Ticket,
} from 'lucide-react';
import { apiFetch, dispatchSessionExpired } from '@/lib/api/fetch';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { USMapChart } from '@/components/dashboards/USMapChart';

// Default EONPRO logos
const EONPRO_LOGO =
  'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';
const EONPRO_ICON =
  'https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png';

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
}

// Match order and items from lib/nav/adminNav (baseAdminNavConfig) for consistent sidebar
const navItems = [
  { icon: Home, path: '/', label: 'Home', active: true },
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
  });
  const [geoData, setGeoData] = useState<{
    stateData: Record<string, { total: number; clinics: Array<{ clinicId: number; clinicName: string; color: string; count: number }> }>;
    clinics: Array<{ id: number; name: string; color: string; totalPatients: number }>;
  } | null>(null);
  const [geoLoading, setGeoLoading] = useState(true);

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

          // Admin / super_admin — show dashboard
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
      // Stagger API calls to reduce concurrent DB connection pressure.
      // Each call needs a DB connection; firing all at once can exhaust the pool.

      // 1. Fetch recent patient intakes (most important for dashboard)
      try {
        const intakesResponse = await fetchWithRetry(
          '/api/patients?limit=100&recent=24h&includeContact=true'
        );
        if (intakesResponse.ok) {
          const intakesData = await intakesResponse.json();
          const patients = intakesData.patients || [];
          setRecentIntakes(patients);
          setStats((prev) => ({ ...prev, newIntakes: patients.length }));
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
          // grossRevenue is in cents, convert to dollars
          const newRevenue = (metricsData.grossRevenue || 0) / 100;
          // mrr (Monthly Recurring Revenue) is also in cents
          const recurringRevenue = (metricsData.mrr || 0) / 100;
          setStats((prev) => ({ ...prev, newRevenue, recurringRevenue }));
        }
      } catch (e: any) {
        if (e.isAuthError) throw e;
        console.warn('[Dashboard] Finance metrics fetch failed:', e.message);
      }

      // 3. Fetch prescriptions/scripts count (staggered after metrics)
      try {
        const ordersResponse = await fetchWithRetry('/api/orders?limit=100&recent=24h');
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          const orders = ordersData.orders || [];
          setStats((prev) => ({ ...prev, newPrescriptions: orders.length }));
        }
      } catch (e: any) {
        if (e.isAuthError) throw e;
        console.warn('[Dashboard] Orders fetch failed:', e.message);
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
      // If auth error, the SessionExpirationHandler will show the modal
      if (error.isAuthError) {
        return;
      }
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
      const query = searchQuery.toLowerCase();
      return (
        patient.firstName?.toLowerCase().includes(query) ||
        patient.lastName?.toLowerCase().includes(query) ||
        patient.email?.toLowerCase().includes(query) ||
        patient.phone?.includes(query) ||
        patient.id?.toString().includes(query)
      );
    })
    .slice(0, 8); // Limit to 8 items

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

            {/* Right: Search */}
            <div className="relative w-96">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patients"
                className="w-full rounded-full border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm transition-all focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${primaryColor}33` } as React.CSSProperties}
              />
            </div>
          </div>

          {/* Welcome */}
          <h1 className="mb-6 text-3xl font-semibold text-gray-900">
            Welcome, <span className="text-gray-900">{displayName}</span>
          </h1>

          {/* Stats Cards */}
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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

            {/* Scripts (24h) */}
            <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10">
                <FileText className="h-6 w-6 text-rose-500" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{stats.newPrescriptions}</p>
                <p className="text-sm text-gray-500">Scripts (24h)</p>
              </div>
            </div>
          </div>

          {/* US Map - Client Distribution */}
          <div className="mb-8">
            <USMapChart
              stateData={geoData?.stateData ?? {}}
              clinics={geoData?.clinics ?? []}
              isLoading={geoLoading}
            />
          </div>

          {/* Patient Intakes Card */}
          <div className="rounded-2xl border border-gray-200 bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900">
                Patient Intakes (Last 24 Hours)
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
                  <div
                    className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                    style={{
                      borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}`,
                    }}
                  ></div>
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
                          className="cursor-pointer transition-colors hover:bg-gray-50/50"
                          onClick={() => {
                            window.location.href = `/patients/${patient.id}`;
                          }}
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
                            <p className="text-sm text-gray-600">{patient.phone || 'N/A'}</p>
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
