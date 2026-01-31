'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Home, Users, Building2, ShoppingCart, Store, TrendingUp,
  DollarSign, Settings, LogOut, Search, Clock, ChevronRight, ClipboardList,
  UserPlus, CreditCard, RefreshCw, FileText
} from 'lucide-react';
import { apiFetch, dispatchSessionExpired } from '@/lib/api/fetch';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

// Default EONPRO logos
const EONPRO_LOGO = 'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';
const EONPRO_ICON = 'https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png';

interface PatientIntake {
  id: number;
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

const navItems = [
  { icon: Home, path: '/', label: 'Home', active: true },
  { icon: Users, path: '/admin/patients', label: 'Patients' },
  { icon: Building2, path: '/admin/clinics', label: 'Clinics' },
  { icon: ShoppingCart, path: '/admin/orders', label: 'Orders' },
  { icon: Store, path: '/admin/products', label: 'Products' },
  { icon: ClipboardList, path: '/intake-forms', label: 'Intake Forms' },
  { icon: TrendingUp, path: '/admin/analytics', label: 'Analytics' },
  { icon: DollarSign, path: '/admin/finance', label: 'Finance' },
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
      const user = localStorage.getItem('user');
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const parsedUser = JSON.parse(user);
        const role = parsedUser.role?.toLowerCase();
        
        // For affiliate/influencer roles, verify auth is still valid before redirecting
        // This prevents redirect loops when session is expired but localStorage persists
        if (role === 'affiliate' || role === 'influencer') {
          try {
            const res = await fetch('/api/affiliate/auth/me', { credentials: 'include' });
            if (res.ok) {
              router.push('/affiliate');
            } else {
              // Session expired - clear localStorage and go to main login
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
          router.push('/patient-portal');
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

  const loadDashboardData = async () => {
    try {
      // Fetch recent patient intakes from last 24 hours (includeContact=true for dashboard display)
      const intakesResponse = await apiFetch('/api/patients?limit=100&recent=24h&includeContact=true');

      if (intakesResponse.ok) {
        const intakesData = await intakesResponse.json();
        const patients = intakesData.patients || [];
        setRecentIntakes(patients);
        setStats(prev => ({ ...prev, newIntakes: patients.length }));
      }

      // Fetch revenue stats for last 7 days from finance metrics (same source as Finance page)
      try {
        const metricsResponse = await apiFetch('/api/finance/metrics?range=7d');
        if (metricsResponse.ok) {
          const metricsData = await metricsResponse.json();
          // grossRevenue is in cents, convert to dollars
          const newRevenue = (metricsData.grossRevenue || 0) / 100;
          // mrr (Monthly Recurring Revenue) is also in cents
          const recurringRevenue = (metricsData.mrr || 0) / 100;
          setStats(prev => ({ ...prev, newRevenue, recurringRevenue }));
        }
      } catch (e: any) {
        // Skip if auth error (already handled by apiFetch)
        if (!e.isAuthError) {
          // Revenue fetch failed, use placeholder
        }
      }

      // Fetch prescriptions/scripts count from last 24 hours
      try {
        const ordersResponse = await apiFetch('/api/orders?limit=100&recent=24h');
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          const orders = ordersData.orders || [];
          setStats(prev => ({ ...prev, newPrescriptions: orders.length }));
        }
      } catch (e: any) {
        // Skip if auth error (already handled by apiFetch)
        if (!e.isAuthError) {
          // Orders fetch failed
        }
      }

      setIntakesLoading(false);
    } catch (error: any) {
      // If auth error, the SessionExpirationHandler will show the modal
      if (error.isAuthError) {
        return;
      }
      console.error('Failed to load dashboard data:', error);
      setIntakesLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    router.push('/login');
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

  const filteredIntakes = recentIntakes.filter(patient => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      patient.firstName?.toLowerCase().includes(query) ||
      patient.lastName?.toLowerCase().includes(query) ||
      patient.email?.toLowerCase().includes(query) ||
      patient.phone?.includes(query) ||
      patient.id?.toString().includes(query)
    );
  }).slice(0, 8); // Limit to 8 items

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

  const displayName = userData?.firstName || userData?.email?.split('@')[0] || 'there';

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
            return (
              <Link
                key={item.path}
                href={item.path}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  item.active
                    ? ''
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={item.active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
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
        <div className="p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            {/* Left: Status & Time */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: systemStatus === 'healthy' ? primaryColor : systemStatus === 'warning' ? '#f59e0b' : '#ef4444' }}
                />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  SYSTEM: {systemStatus.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-800">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-sm text-gray-600">
                {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
              </p>
            </div>

            {/* Right: Search */}
            <div className="relative w-96">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patients"
                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 transition-all text-sm"
                style={{ '--tw-ring-color': `${primaryColor}33` } as React.CSSProperties}
              />
            </div>
          </div>

          {/* Welcome */}
          <h1 className="text-3xl font-semibold text-gray-900 mb-6">
            Welcome, <span className="text-gray-900">{displayName}</span>
          </h1>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Intakes (24h) */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
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
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <CreditCard className="h-6 w-6" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats.newRevenue)}</p>
                <p className="text-sm text-gray-500">Revenue (7 days)</p>
              </div>
            </div>

            {/* Recurring Revenue */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats.recurringRevenue)}</p>
                <p className="text-sm text-gray-500">Recurring</p>
              </div>
            </div>

            {/* Scripts (24h) */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-rose-500" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{stats.newPrescriptions}</p>
                <p className="text-sm text-gray-500">Scripts (24h)</p>
              </div>
            </div>
          </div>

          {/* Patient Intakes Card */}
          <div className="bg-white rounded-2xl border border-gray-200">
            {/* Header */}
            <div className="px-6 py-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Patient Intakes (Last 24 Hours)</h2>
              <Link
                href="/admin/patients"
                className="text-sm text-gray-500 font-medium hover:opacity-80"
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
                className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${primaryColor}33` } as React.CSSProperties}
              />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {intakesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div
                    className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent"
                    style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
                  ></div>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-t border-gray-100">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DOB</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredIntakes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-16 text-center">
                          <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 font-medium">No patient intakes in the last 24 hours</p>
                          <p className="text-sm text-gray-400 mt-1">New intakes will appear here automatically</p>
                        </td>
                      </tr>
                    ) : (
                      filteredIntakes.map((patient) => (
                        <tr key={patient.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => router.push(`/patients/${patient.id}`)}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: new Date(patient.createdAt).getTime() > Date.now() - 3600000
                                    ? primaryColor
                                    : '#fbbf24'
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
                                <p className="text-xs text-gray-400">#{String(patient.id).padStart(6, '0')}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-600">{formatDate(patient.dateOfBirth)}</p>
                            <p className="text-xs text-gray-400">({formatGender(patient.gender)})</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-600">{patient.phone || 'N/A'}</p>
                            <p className="text-xs text-gray-400 truncate max-w-[180px]">{patient.email || 'N/A'}</p>
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
