'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, TrendingUp, CreditCard, AlertTriangle, Users,
  ArrowUpRight, ArrowDownRight, RefreshCw, Download, ExternalLink,
  Wallet, Receipt, ShieldAlert, Package, Link2, Calendar,
  ChevronDown, Loader2, CheckCircle, XCircle, Clock, Ban, Building2,
  ChevronLeft, ChevronRight, Filter
} from 'lucide-react';

// Date range options
const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'all_time', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

// Helper to get date range timestamps
function getDateRange(range: string, customStart?: string, customEnd?: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (range) {
    case 'today':
      return { startDate: today.toISOString() };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: yesterday.toISOString(), endDate: today.toISOString() };
    }
    case 'last_7_days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      return { startDate: start.toISOString() };
    }
    case 'last_30_days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { startDate: start.toISOString() };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start.toISOString() };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case 'last_3_months': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 3);
      return { startDate: start.toISOString() };
    }
    case 'last_6_months': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 6);
      return { startDate: start.toISOString() };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: start.toISOString() };
    }
    case 'last_year': {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear(), 0, 1);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    case 'custom':
      return {
        startDate: customStart ? new Date(customStart).toISOString() : undefined,
        endDate: customEnd ? new Date(customEnd).toISOString() : undefined,
      };
    case 'all_time':
    default:
      return {};
  }
}

// Types
interface Clinic {
  id: number;
  name: string;
  stripeAccountId: string | null;
  stripePlatformAccount: boolean;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean;
}

interface BalanceData {
  totalAvailableFormatted: string;
  totalPendingFormatted: string;
  totalAvailable: number;
  totalPending: number;
}

interface ReportSummary {
  revenue: {
    grossFormatted: string;
    netFormatted: string;
    refundsFormatted: string;
    transactionCount: number;
    averageTransactionValueFormatted: string;
  };
  subscriptions: {
    mrrFormatted: string;
    arrFormatted: string;
    active: number;
    canceled: number;
  };
  invoices: {
    paid: number;
    open: number;
    paidAmountFormatted: string;
    openAmountFormatted: string;
  };
  refunds: {
    count: number;
    totalFormatted: string;
    refundRate: string;
  };
}

interface Dispute {
  id: string;
  amountFormatted: string;
  status: string;
  reason: string;
  reasonDisplay: string;
  createdAt: string;
  evidenceDueBy: string | null;
  customerEmail: string | null;
}

interface Payout {
  id: string;
  amountFormatted: string;
  status: string;
  statusDisplay: string;
  arrivalDateFormatted: string;
}

interface Product {
  id: string;
  name: string;
  active: boolean;
  defaultPrice: {
    amountFormatted: string;
    type: string;
    recurring: { interval: string } | null;
  } | null;
}

interface Customer {
  id: string;
  email: string;
  name: string;
  analytics: {
    totalSpentFormatted: string;
    chargeCount: number;
  };
  activeSubscriptionCount: number;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Stat Card Component
function StatCard({
  title,
  value,
  subValue,
  icon: Icon,
  color = 'blue',
  trend,
  onClick,
}: {
  title: string;
  value: string;
  subValue?: string;
  icon: any;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray';
  trend?: 'up' | 'down';
  onClick?: () => void;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    gray: 'bg-gray-50 text-gray-600 border-gray-100',
  };

  return (
    <div
      className={`rounded-xl border p-5 ${colorClasses[color]} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <Icon className="w-5 h-5 opacity-80" />
        {trend && (
          <span className={trend === 'up' ? 'text-emerald-500' : 'text-red-500'}>
            {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          </span>
        )}
      </div>
      <p className="text-sm font-medium opacity-80">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {subValue && <p className="text-xs opacity-60 mt-1">{subValue}</p>}
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; icon: any }> = {
    paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
    succeeded: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
    active: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
    in_transit: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock },
    needs_response: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
    open: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock },
    failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
    canceled: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Ban },
    void: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Ban },
  };

  const config = statusConfig[status.toLowerCase()] || { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock };
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3 h-3" />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// Main Dashboard Component
export default function StripeDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'disputes' | 'payouts' | 'products' | 'customers' | 'connect'>('overview');
  const [refreshing, setRefreshing] = useState(false);
  
  // Date range filtering
  const [dateRange, setDateRange] = useState('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Pagination
  const [disputesPage, setDisputesPage] = useState(1);
  const [payoutsPage, setPayoutsPage] = useState(1);
  const [customersPage, setCustomersPage] = useState(1);
  const [pageSize] = useState(25);
  const [hasMoreDisputes, setHasMoreDisputes] = useState(false);
  const [hasMorePayouts, setHasMorePayouts] = useState(false);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  
  // Clinic selection (for multi-tenant)
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string>('');

  // Data states
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [disputeSummary, setDisputeSummary] = useState<any>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payoutSummary, setPayoutSummary] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSummary, setProductSummary] = useState<any>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSummary, setCustomerSummary] = useState<any>(null);
  const [connectStatus, setConnectStatus] = useState<any>(null);

  // State to track if current clinic has Stripe connected
  const [clinicStripeStatus, setClinicStripeStatus] = useState<{
    hasStripe: boolean;
    isPlatform: boolean;
    checked: boolean;
  }>({ hasStripe: false, isPlatform: false, checked: false });

  // Auth check & load clinics
  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      const parsedUser = JSON.parse(user);
      const role = parsedUser.role?.toLowerCase();
      if (role !== 'admin' && role !== 'super_admin') {
        router.push('/login');
        return;
      }
      setUserRole(role);
      
      // Load clinics for super_admin
      if (role === 'super_admin') {
        loadClinics();
      } else if (parsedUser.clinicId) {
        // Admin sees only their clinic - check if they have Stripe connected
        setSelectedClinicId(parsedUser.clinicId);
        checkClinicStripeStatus(parsedUser.clinicId);
      }
    } catch {
      router.push('/login');
    }
  }, [router]);

  // Check if a clinic has Stripe connected
  const checkClinicStripeStatus = async (clinicId: number) => {
    try {
      const res = await fetch(`/api/stripe/connect?clinicId=${clinicId}`);
      if (res.ok) {
        const data = await res.json();
        const stripe = data.stripe || {};
        setClinicStripeStatus({
          hasStripe: stripe.hasConnectedAccount || stripe.isPlatformAccount || false,
          isPlatform: stripe.isPlatformAccount || false,
          checked: true,
        });
      } else {
        setClinicStripeStatus({ hasStripe: false, isPlatform: false, checked: true });
      }
    } catch (err) {
      console.error('Failed to check clinic Stripe status:', err);
      setClinicStripeStatus({ hasStripe: false, isPlatform: false, checked: true });
    }
  };

  // Load available clinics
  const loadClinics = async () => {
    try {
      const res = await fetch('/api/admin/clinics');
      if (res.ok) {
        const data = await res.json();
        setClinics(data.clinics || []);
      }
    } catch (err) {
      console.error('Failed to load clinics:', err);
    }
  };

  // Build API URL with optional clinic filter
  const buildApiUrl = (baseUrl: string, params: Record<string, string> = {}) => {
    const url = new URL(baseUrl, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    if (selectedClinicId) {
      url.searchParams.set('clinicId', selectedClinicId.toString());
    }
    return url.toString();
  };

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build date range params
      const { startDate, endDate } = getDateRange(dateRange, customStartDate, customEndDate);
      const dateParams = new URLSearchParams();
      if (startDate) dateParams.set('startDate', startDate);
      if (endDate) dateParams.set('endDate', endDate);
      const dateQuery = dateParams.toString() ? `&${dateParams.toString()}` : '';
      
      // Build URLs with clinic filter
      const clinicParam = selectedClinicId ? `&clinicId=${selectedClinicId}` : '';
      
      // Fetch all data in parallel
      const [balanceRes, reportRes, disputesRes, payoutsRes, productsRes, customersRes] = await Promise.all([
        fetch(`/api/stripe/balance?includeTransactions=false${clinicParam}`),
        fetch(`/api/stripe/reports?type=summary${clinicParam}${dateQuery}`),
        fetch(`/api/stripe/disputes?limit=${pageSize}${clinicParam}${dateQuery}`),
        fetch(`/api/stripe/payouts?limit=${pageSize}${clinicParam}${dateQuery}`),
        fetch(`/api/stripe/products?limit=50${clinicParam}`),
        fetch(`/api/stripe/customers?limit=${pageSize}&includeCharges=true&includeSubscriptions=false${clinicParam}`),
      ]);
      
      // Also fetch connect status if a clinic is selected
      if (selectedClinicId) {
        const connectRes = await fetch(`/api/stripe/connect?clinicId=${selectedClinicId}`);
        if (connectRes.ok) {
          const connectData = await connectRes.json();
          setConnectStatus(connectData);
        }
      }

      // Process balance
      if (balanceRes.ok) {
        const data = await balanceRes.json();
        setBalance(data.balance);
      }

      // Process report
      if (reportRes.ok) {
        const data = await reportRes.json();
        setReport(data.report?.data);
      }

      // Process disputes
      if (disputesRes.ok) {
        const data = await disputesRes.json();
        setDisputes(data.disputes || []);
        setDisputeSummary(data.summary);
        setHasMoreDisputes(data.pagination?.hasMore || false);
      }

      // Process payouts
      if (payoutsRes.ok) {
        const data = await payoutsRes.json();
        setPayouts(data.payouts || []);
        setPayoutSummary(data.summary);
        setHasMorePayouts(data.pagination?.hasMore || false);
      }

      // Process products
      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.products || []);
        setProductSummary(data.summary);
      }

      // Process customers
      if (customersRes.ok) {
        const data = await customersRes.json();
        setCustomers(data.customers || []);
        setCustomerSummary(data.summary);
        setHasMoreCustomers(data.pagination?.hasMore || false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Stripe data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, customStartDate, customEndDate, selectedClinicId, pageSize]);

  useEffect(() => {
    // For admin users, wait until we've checked their clinic's Stripe status
    if (userRole === 'admin' && !clinicStripeStatus.checked) {
      return;
    }
    // Don't fetch if admin's clinic doesn't have Stripe
    if (userRole === 'admin' && !clinicStripeStatus.hasStripe) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [fetchData, selectedClinicId, dateRange, customStartDate, customEndDate, userRole, clinicStripeStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleClinicChange = (clinicId: number | null) => {
    setSelectedClinicId(clinicId);
    setConnectStatus(null);
  };

  const handleDateRangeChange = (range: string) => {
    setDateRange(range);
    // Reset pagination when date range changes
    setDisputesPage(1);
    setPayoutsPage(1);
    setCustomersPage(1);
  };

  // Load more functions for pagination
  const loadMoreDisputes = async () => {
    if (!hasMoreDisputes) return;
    const { startDate, endDate } = getDateRange(dateRange, customStartDate, customEndDate);
    const params = new URLSearchParams();
    params.set('limit', pageSize.toString());
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (disputes.length > 0) params.set('starting_after', disputes[disputes.length - 1].id);
    
    const res = await fetch(`/api/stripe/disputes?${params}`);
    if (res.ok) {
      const data = await res.json();
      setDisputes([...disputes, ...(data.disputes || [])]);
      setHasMoreDisputes(data.pagination?.hasMore || false);
    }
  };

  const loadMorePayouts = async () => {
    if (!hasMorePayouts) return;
    const { startDate, endDate } = getDateRange(dateRange, customStartDate, customEndDate);
    const params = new URLSearchParams();
    params.set('limit', pageSize.toString());
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (payouts.length > 0) params.set('starting_after', payouts[payouts.length - 1].id);
    
    const res = await fetch(`/api/stripe/payouts?${params}`);
    if (res.ok) {
      const data = await res.json();
      setPayouts([...payouts, ...(data.payouts || [])]);
      setHasMorePayouts(data.pagination?.hasMore || false);
    }
  };

  const loadMoreCustomers = async () => {
    if (!hasMoreCustomers) return;
    const params = new URLSearchParams();
    params.set('limit', pageSize.toString());
    params.set('includeCharges', 'true');
    if (customers.length > 0) params.set('starting_after', customers[customers.length - 1].id);
    
    const res = await fetch(`/api/stripe/customers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCustomers([...customers, ...(data.customers || [])]);
      setHasMoreCustomers(data.pagination?.hasMore || false);
    }
  };

  const selectedClinic = clinics.find(c => c.id === selectedClinicId);

  // For non-super-admin users, check if their clinic has Stripe
  if (userRole === 'admin' && clinicStripeStatus.checked && !clinicStripeStatus.hasStripe) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md text-center bg-white rounded-xl shadow-lg p-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Stripe Not Configured</h2>
          <p className="text-gray-600 mb-6">
            Your clinic does not have a Stripe account connected. Please contact your administrator
            to set up payment processing for your clinic.
          </p>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Wait for Stripe status check for admins
  if (userRole === 'admin' && !clinicStripeStatus.checked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-gray-500">Checking Stripe configuration...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading Stripe data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CreditCard className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Stripe Dashboard</h1>
                <p className="text-sm text-gray-500">
                  {selectedClinic ? `${selectedClinic.name}` : 'Platform Account (EONmeds)'} - Real-time financial data
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Date Range Selector */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <select
                  value={dateRange}
                  onChange={(e) => handleDateRangeChange(e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                >
                  {DATE_RANGES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Custom Date Range */}
              {dateRange === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg"
                  />
                </div>
              )}
              
              {/* Clinic Selector (Super Admin only) */}
              {userRole === 'super_admin' && clinics.length > 0 && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  <select
                    value={selectedClinicId || ''}
                    onChange={(e) => handleClinicChange(e.target.value ? parseInt(e.target.value) : null)}
                    className="px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Platform Account (All)</option>
                    {clinics.map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinic.name}
                        {clinic.stripePlatformAccount ? ' (Platform)' : ''}
                        {clinic.stripeAccountId && !clinic.stripePlatformAccount ? ' (Connected)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition"
              >
                <ExternalLink className="w-4 h-4" />
                Stripe Dashboard
              </a>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-px">
            {[
              { id: 'overview', label: 'Overview', icon: TrendingUp },
              { id: 'disputes', label: 'Disputes', icon: ShieldAlert, badge: disputeSummary?.pending },
              { id: 'payouts', label: 'Payouts', icon: Wallet },
              { id: 'products', label: 'Products', icon: Package },
              { id: 'customers', label: 'Customers', icon: Users },
              ...(selectedClinicId && userRole === 'super_admin' ? [{ id: 'connect', label: 'Connect Settings', icon: Link2 }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${
                  activeTab === tab.id
                    ? 'bg-gray-50 text-purple-600 border-t border-x border-gray-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.badge && tab.badge > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewTab
            balance={balance}
            report={report}
            disputes={disputes}
            disputeSummary={disputeSummary}
            dateRangeLabel={DATE_RANGES.find(r => r.value === dateRange)?.label || 'Selected Period'}
          />
        )}

        {activeTab === 'disputes' && (
          <DisputesTab 
            disputes={disputes} 
            summary={disputeSummary} 
            onLoadMore={loadMoreDisputes}
            hasMore={hasMoreDisputes}
          />
        )}

        {activeTab === 'payouts' && (
          <PayoutsTab 
            payouts={payouts} 
            summary={payoutSummary}
            onLoadMore={loadMorePayouts}
            hasMore={hasMorePayouts}
          />
        )}

        {activeTab === 'products' && (
          <ProductsTab products={products} summary={productSummary} />
        )}

        {activeTab === 'customers' && (
          <CustomersTab 
            customers={customers} 
            summary={customerSummary}
            onLoadMore={loadMoreCustomers}
            hasMore={hasMoreCustomers}
          />
        )}
        
        {activeTab === 'connect' && selectedClinicId && (
          <ConnectTab 
            clinicId={selectedClinicId} 
            status={connectStatus} 
            onRefresh={fetchData}
          />
        )}
      </div>
    </div>
  );
}

// Overview Tab
function OverviewTab({
  balance,
  report,
  disputes,
  disputeSummary,
  dateRangeLabel,
}: {
  balance: BalanceData | null;
  report: ReportSummary | null;
  disputes: Dispute[];
  disputeSummary: any;
  dateRangeLabel: string;
}) {
  return (
    <div className="space-y-6">
      {/* Current Balance Cards - Not Date Filtered */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium text-gray-500">Current Balance</h3>
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Real-time</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Available Balance"
            value={balance?.totalAvailableFormatted || '$0.00'}
            icon={Wallet}
            color={(balance?.totalAvailable || 0) >= 0 ? 'green' : 'red'}
          />
          <StatCard
            title="Pending Balance"
            value={balance?.totalPendingFormatted || '$0.00'}
            icon={Clock}
            color="blue"
            subValue="Processing"
          />
          <StatCard
            title="Gross Revenue"
            value={report?.revenue?.grossFormatted || '$0.00'}
            icon={DollarSign}
            color="purple"
            subValue={`${report?.revenue?.transactionCount || 0} transactions in ${dateRangeLabel.toLowerCase()}`}
          />
          <StatCard
            title="Net Revenue"
            value={report?.revenue?.netFormatted || '$0.00'}
            icon={TrendingUp}
            color="green"
            trend="up"
            subValue={dateRangeLabel}
          />
        </div>
      </div>

      {/* Subscriptions - Current State */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium text-gray-500">Recurring Revenue</h3>
          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full">Current subscriptions</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Monthly Recurring Revenue"
            value={report?.subscriptions?.mrrFormatted || '$0.00'}
            icon={RefreshCw}
            color="purple"
            subValue={`${report?.subscriptions?.active || 0} active subscriptions`}
          />
          <StatCard
            title="Annual Recurring Revenue"
            value={report?.subscriptions?.arrFormatted || '$0.00'}
            icon={Calendar}
            color="blue"
          />
          <StatCard
            title="Refunds"
            value={report?.refunds?.totalFormatted || '$0.00'}
            icon={ArrowDownRight}
            color="orange"
            subValue={`${report?.refunds?.count || 0} refunds (${report?.refunds?.refundRate || '0%'}) in ${dateRangeLabel.toLowerCase()}`}
          />
          <StatCard
            title="Open Invoices"
            value={report?.invoices?.openAmountFormatted || '$0.00'}
            icon={Receipt}
            color="gray"
            subValue={`${report?.invoices?.open || 0} invoices pending`}
          />
        </div>
      </div>

      {/* Disputes Alert */}
      {disputeSummary?.pending > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-800">
                {disputeSummary.pending} Dispute{disputeSummary.pending > 1 ? 's' : ''} Need Response
              </h3>
              <p className="text-sm text-red-600">
                Total disputed: {disputeSummary.totalDisputedFormatted}
              </p>
            </div>
            <a
              href="https://dashboard.stripe.com/disputes"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
            >
              View in Stripe
            </a>
          </div>
        </div>
      )}

      {/* Recent Disputes */}
      {disputes.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            Recent Disputes
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Reason</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Evidence Due</th>
                </tr>
              </thead>
              <tbody>
                {disputes.slice(0, 5).map((dispute) => (
                  <tr key={dispute.id} className="border-b last:border-0">
                    <td className="py-3 font-semibold">{dispute.amountFormatted}</td>
                    <td className="py-3 text-gray-600">{dispute.reasonDisplay}</td>
                    <td className="py-3">
                      <StatusBadge status={dispute.status} />
                    </td>
                    <td className="py-3 text-gray-500">
                      {dispute.evidenceDueBy ? formatDate(dispute.evidenceDueBy) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Disputes Tab
function DisputesTab({ 
  disputes, 
  summary, 
  onLoadMore, 
  hasMore 
}: { 
  disputes: Dispute[]; 
  summary: any;
  onLoadMore: () => void;
  hasMore: boolean;
}) {
  const [loadingMore, setLoadingMore] = useState(false);
  
  const handleLoadMore = async () => {
    setLoadingMore(true);
    await onLoadMore();
    setLoadingMore(false);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Disputed"
          value={summary?.totalDisputedFormatted || '$0.00'}
          icon={ShieldAlert}
          color="red"
        />
        <StatCard
          title="Pending Response"
          value={summary?.pending?.toString() || '0'}
          icon={Clock}
          color="orange"
        />
        <StatCard
          title="Won"
          value={summary?.won?.amountFormatted || '$0.00'}
          icon={CheckCircle}
          color="green"
          subValue={`${summary?.won?.count || 0} disputes`}
        />
        <StatCard
          title="Lost"
          value={summary?.lost?.amountFormatted || '$0.00'}
          icon={XCircle}
          color="red"
          subValue={`${summary?.lost?.count || 0} disputes`}
        />
      </div>

      {/* Win Rate */}
      {summary?.winRate && (
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Dispute Win Rate</h3>
              <p className="text-sm text-gray-500">Based on resolved disputes</p>
            </div>
            <div className="text-3xl font-bold text-emerald-600">{summary.winRate}</div>
          </div>
        </div>
      )}

      {/* Disputes Table */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">All Disputes ({disputes.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">ID</th>
                <th className="pb-3 font-medium">Amount</th>
                <th className="pb-3 font-medium">Reason</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Created</th>
                <th className="pb-3 font-medium">Evidence Due</th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((dispute) => (
                <tr key={dispute.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm text-gray-500">{dispute.id.slice(-8)}</td>
                  <td className="py-3 font-semibold">{dispute.amountFormatted}</td>
                  <td className="py-3 text-gray-600">{dispute.reasonDisplay}</td>
                  <td className="py-3">
                    <StatusBadge status={dispute.status} />
                  </td>
                  <td className="py-3 text-gray-500">{formatDate(dispute.createdAt)}</td>
                  <td className="py-3 text-gray-500">
                    {dispute.evidenceDueBy ? formatDate(dispute.evidenceDueBy) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Load More Button */}
        {hasMore && (
          <div className="mt-4 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </span>
              ) : (
                'Load More Disputes'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Payouts Tab
function PayoutsTab({ 
  payouts, 
  summary,
  onLoadMore,
  hasMore
}: { 
  payouts: Payout[]; 
  summary: any;
  onLoadMore: () => void;
  hasMore: boolean;
}) {
  const [loadingMore, setLoadingMore] = useState(false);
  
  const handleLoadMore = async () => {
    setLoadingMore(true);
    await onLoadMore();
    setLoadingMore(false);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Paid Out"
          value={summary?.totalPaidOutFormatted || '$0.00'}
          icon={Wallet}
          color="green"
        />
        <StatCard
          title="Pending"
          value={summary?.totalPendingFormatted || '$0.00'}
          icon={Clock}
          color="blue"
        />
        <StatCard
          title="Total Payouts"
          value={summary?.totalPayouts?.toString() || '0'}
          icon={Receipt}
          color="purple"
        />
        <StatCard
          title="Failed"
          value={summary?.totalFailedFormatted || '$0.00'}
          icon={XCircle}
          color="red"
        />
      </div>

      {/* Payouts Table */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Payouts ({payouts.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">ID</th>
                <th className="pb-3 font-medium">Amount</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Arrival Date</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm text-gray-500">{payout.id.slice(-8)}</td>
                  <td className="py-3 font-semibold">{payout.amountFormatted}</td>
                  <td className="py-3">
                    <StatusBadge status={payout.status} />
                  </td>
                  <td className="py-3 text-gray-500">{formatDate(payout.arrivalDateFormatted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Load More Button */}
        {hasMore && (
          <div className="mt-4 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </span>
              ) : (
                'Load More Payouts'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Products Tab
function ProductsTab({ products, summary }: { products: Product[]; summary: any }) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Products"
          value={summary?.totalProducts?.toString() || '0'}
          icon={Package}
          color="purple"
        />
        <StatCard
          title="Active Products"
          value={summary?.activeProducts?.toString() || '0'}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          title="One-Time"
          value={summary?.oneTimeProducts?.toString() || '0'}
          icon={DollarSign}
          color="blue"
        />
        <StatCard
          title="Recurring"
          value={summary?.recurringProducts?.toString() || '0'}
          icon={RefreshCw}
          color="orange"
        />
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => (
          <div
            key={product.id}
            className={`bg-white rounded-xl border p-4 ${!product.active ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-semibold text-gray-900">{product.name}</h4>
              <StatusBadge status={product.active ? 'active' : 'inactive'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-gray-900">
                {product.defaultPrice?.amountFormatted || 'N/A'}
              </span>
              {product.defaultPrice?.recurring && (
                <span className="text-sm text-gray-500">
                  / {product.defaultPrice.recurring.interval}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Customers Tab
function CustomersTab({ 
  customers, 
  summary,
  onLoadMore,
  hasMore
}: { 
  customers: Customer[]; 
  summary: any;
  onLoadMore: () => void;
  hasMore: boolean;
}) {
  const [loadingMore, setLoadingMore] = useState(false);
  
  const handleLoadMore = async () => {
    setLoadingMore(true);
    await onLoadMore();
    setLoadingMore(false);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Customers"
          value={summary?.totalCustomers?.toString() || '0'}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Total Lifetime Value"
          value={summary?.totalLifetimeValueFormatted || '$0.00'}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          title="Average LTV"
          value={summary?.averageLTVFormatted || '$0.00'}
          icon={TrendingUp}
          color="purple"
        />
        <StatCard
          title="With Subscriptions"
          value={summary?.subscriptionRate || '0%'}
          icon={RefreshCw}
          color="orange"
        />
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Customers ({customers.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">Customer</th>
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Total Spent</th>
                <th className="pb-3 font-medium">Orders</th>
                <th className="pb-3 font-medium">Subscriptions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 font-medium">{customer.name || '-'}</td>
                  <td className="py-3 text-gray-600">{customer.email || '-'}</td>
                  <td className="py-3 font-semibold text-emerald-600">
                    {customer.analytics?.totalSpentFormatted || '$0.00'}
                  </td>
                  <td className="py-3 text-gray-500">{customer.analytics?.chargeCount || 0}</td>
                  <td className="py-3">
                    {customer.activeSubscriptionCount > 0 ? (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                        {customer.activeSubscriptionCount} active
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Load More Button */}
        {hasMore && (
          <div className="mt-4 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </span>
              ) : (
                'Load More Customers'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Connect Tab - Stripe Connect Management
function ConnectTab({ 
  clinicId, 
  status, 
  onRefresh 
}: { 
  clinicId: number; 
  status: any; 
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreateAccount = async () => {
    if (!email) {
      setError('Email is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, email }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account');
      }
      
      // Redirect to onboarding
      window.open(data.onboardingUrl, '_blank');
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleContinueOnboarding = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stripe/connect?clinicId=${clinicId}&action=onboarding`);
      const data = await res.json();
      if (data.onboardingUrl) {
        window.open(data.onboardingUrl, '_blank');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stripe/connect?clinicId=${clinicId}&action=dashboard`);
      const data = await res.json();
      if (data.dashboardUrl) {
        window.open(data.dashboardUrl, '_blank');
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncStatus = async () => {
    setLoading(true);
    try {
      await fetch(`/api/stripe/connect?clinicId=${clinicId}&action=sync`);
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stripeStatus = status?.stripe;
  const hasAccount = stripeStatus?.hasConnectedAccount;
  const isPlatform = stripeStatus?.isPlatformAccount;

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-purple-500" />
          Stripe Connect Status
        </h3>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {isPlatform ? (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-purple-600" />
              <span className="font-semibold text-purple-900">Platform Account</span>
            </div>
            <p className="text-sm text-purple-700">
              This clinic uses the platform's Stripe account directly (EONmeds). 
              All transactions are processed through the main account.
            </p>
          </div>
        ) : hasAccount ? (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg border ${
              stripeStatus.onboardingComplete 
                ? 'bg-emerald-50 border-emerald-200' 
                : 'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {stripeStatus.onboardingComplete ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-yellow-600" />
                  )}
                  <span className={`font-semibold ${
                    stripeStatus.onboardingComplete ? 'text-emerald-900' : 'text-yellow-900'
                  }`}>
                    {stripeStatus.onboardingComplete ? 'Connected' : 'Onboarding Incomplete'}
                  </span>
                </div>
                <span className="text-sm font-mono text-gray-500">
                  {stripeStatus.accountId}
                </span>
              </div>
            </div>

            {/* Status Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Charges</p>
                <p className={`font-semibold ${stripeStatus.chargesEnabled ? 'text-emerald-600' : 'text-red-600'}`}>
                  {stripeStatus.chargesEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Payouts</p>
                <p className={`font-semibold ${stripeStatus.payoutsEnabled ? 'text-emerald-600' : 'text-red-600'}`}>
                  {stripeStatus.payoutsEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Details Submitted</p>
                <p className={`font-semibold ${stripeStatus.detailsSubmitted ? 'text-emerald-600' : 'text-yellow-600'}`}>
                  {stripeStatus.detailsSubmitted ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Connected</p>
                <p className="font-semibold text-gray-700">
                  {stripeStatus.connectedAt ? formatDate(stripeStatus.connectedAt) : '-'}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              {!stripeStatus.onboardingComplete && (
                <button
                  onClick={handleContinueOnboarding}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition disabled:opacity-50"
                >
                  <ExternalLink className="w-4 h-4" />
                  Continue Onboarding
                </button>
              )}
              {stripeStatus.onboardingComplete && (
                <button
                  onClick={handleOpenDashboard}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Stripe Dashboard
                </button>
              )}
              <button
                onClick={handleSyncStatus}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Sync Status
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-gray-500" />
                <span className="font-semibold text-gray-700">No Stripe Account Connected</span>
              </div>
              <p className="text-sm text-gray-600">
                This clinic doesn't have a connected Stripe account. Create one to enable 
                direct payments to this clinic.
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-3">Create Connected Account</h4>
              <div className="flex gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="clinic@example.com"
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={handleCreateAccount}
                  disabled={loading || !email}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Connect Stripe
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                The clinic owner will receive an email to complete Stripe onboarding.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* How it Works */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">How Stripe Connect Works</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold mb-3">1</div>
            <h4 className="font-medium mb-1">Create Account</h4>
            <p className="text-sm text-gray-600">
              Enter the clinic's email to create a connected Stripe account.
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold mb-3">2</div>
            <h4 className="font-medium mb-1">Complete Onboarding</h4>
            <p className="text-sm text-gray-600">
              Clinic owner completes Stripe's identity verification and bank setup.
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold mb-3">3</div>
            <h4 className="font-medium mb-1">Start Accepting Payments</h4>
            <p className="text-sm text-gray-600">
              Payments go directly to the clinic's bank account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
