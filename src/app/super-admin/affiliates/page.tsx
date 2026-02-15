'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  Plus,
  Search,
  Building2,
  DollarSign,
  TrendingUp,
  Eye,
  Copy,
  Check,
  ChevronDown,
  AlertCircle,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  MoreHorizontal,
  BarChart3,
  Target,
  MousePointer,
  Trophy,
  Wrench,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Clinic {
  id: number;
  name: string;
  subdomain: string | null;
}

interface Affiliate {
  id: number;
  displayName: string;
  status: string;
  createdAt: string;
  clinicId: number;
  clinic: {
    id: number;
    name: string;
    subdomain: string | null;
  };
  user: {
    email: string;
    firstName: string;
    lastName: string;
    lastLogin: string | null;
    status: string;
  };
  refCodes: Array<{
    id: number;
    refCode: string;
    isActive: boolean;
  }>;
  currentPlan: {
    id: number;
    name: string;
    planType: string;
    flatAmountCents: number | null;
    percentBps: number | null;
    initialPercentBps?: number | null;
    initialFlatAmountCents?: number | null;
    recurringPercentBps?: number | null;
    recurringFlatAmountCents?: number | null;
  } | null;
  stats: {
    totalConversions: number;
    totalRevenueCents: number;
    totalCommissionCents: number;
  };
}

interface CommissionPlan {
  id: number;
  name: string;
  planType: string;
  flatAmountCents: number | null;
  percentBps: number | null;
  // Separate initial/recurring rates
  initialPercentBps: number | null;
  initialFlatAmountCents: number | null;
  recurringPercentBps: number | null;
  recurringFlatAmountCents: number | null;
  recurringEnabled: boolean;
  isActive: boolean;
  clinicId: number;
}

interface CrossClinicAnalytics {
  totals: {
    totalClinics: number;
    totalAffiliates: number;
    activeAffiliates: number;
    totalCodes: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
    avgConversionRate: number;
  };
  clinicBreakdown: Array<{
    clinicId: number;
    clinicName: string;
    totalCodes: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
    activeAffiliates: number;
  }>;
  topCodes: Array<{
    code: string;
    affiliateName: string;
    clinicName: string;
    conversions: number;
    revenue: number;
  }>;
}

interface DiagnosticCheck {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
  value?: number | string;
  details?: Record<string, any>;
}

interface DiagnosticsData {
  timestamp: string;
  overallStatus: 'healthy' | 'warning' | 'error';
  checks: DiagnosticCheck[];
  recentActivity: {
    recentTouches: Array<{
      refCode: string;
      affiliateName: string;
      clinicName: string;
      createdAt: string;
      converted: boolean;
    }>;
    recentCommissions: Array<{
      affiliateName: string;
      clinicName: string;
      amountCents: number;
      commissionCents: number;
      status: string;
      createdAt: string;
    }>;
    recentReferrals: Array<{
      promoCode: string;
      patientId: number;
      hasModernAttribution: boolean;
      createdAt: string;
    }>;
  };
  migrationStatus: {
    legacyInfluencerCount: number;
    modernAffiliateCount: number;
    unmigratedCodes: string[];
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

export default function SuperAdminAffiliatesPage() {
  const router = useRouter();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<number | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create form state
  const [createForm, setCreateForm] = useState({
    clinicId: '',
    email: '',
    password: '',
    displayName: '',
    firstName: '',
    lastName: '',
    initialRefCode: '',
    commissionPlanId: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  // Edit state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAffiliate, setEditingAffiliate] = useState<Affiliate | null>(null);
  const [editForm, setEditForm] = useState({
    displayName: '',
    status: '',
    firstName: '',
    lastName: '',
    email: '',
    commissionPlanId: '',
  });
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAffiliate, setDeletingAffiliate] = useState<Affiliate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Actions dropdown
  const [openActionMenu, setOpenActionMenu] = useState<number | null>(null);

  // Analytics state
  const [analytics, setAnalytics] = useState<CrossClinicAnalytics | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);

  // Diagnostics state
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    const token = localStorage.getItem('auth-token');

    try {
      const response = await fetch(
        `/api/super-admin/affiliates/analytics?period=${analyticsPeriod}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        setAnalytics(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsPeriod]);

  const fetchDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    const token = localStorage.getItem('auth-token');

    try {
      const response = await apiFetch('/api/super-admin/affiliates/diagnostics');

      if (response.ok) {
        setDiagnostics(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch diagnostics:', error);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const fetchData = async () => {
    const token = localStorage.getItem('auth-token');
    setFetchError(null);
    setMigrationNeeded(false);

    try {
      // Fetch clinics first
      const clinicsRes = await apiFetch('/api/super-admin/clinics');

      if (clinicsRes.ok) {
        const clinicsData = await clinicsRes.json();
        setClinics(clinicsData.clinics || []);
      }

      // Fetch all affiliates across all clinics
      const affiliatesRes = await apiFetch('/api/super-admin/affiliates');

      const data = await affiliatesRes.json();

      if (affiliatesRes.ok) {
        setAffiliates(data.affiliates || []);
        setPlans(data.plans || []);

        // Check if migration warning exists
        if (data.details?.includes('migration')) {
          setMigrationNeeded(true);
        }
      } else {
        setFetchError(data.error || 'Failed to load affiliates');
        if (data.details?.includes('migration')) {
          setMigrationNeeded(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setFetchError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    const token = localStorage.getItem('auth-token');

    try {
      const response = await apiFetch('/api/super-admin/affiliates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...createForm,
          clinicId: parseInt(createForm.clinicId),
          commissionPlanId: createForm.commissionPlanId
            ? parseInt(createForm.commissionPlanId)
            : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create affiliate');
      }

      setShowCreateModal(false);
      setCreateForm({
        clinicId: '',
        email: '',
        password: '',
        displayName: '',
        firstName: '',
        lastName: '',
        initialRefCode: '',
        commissionPlanId: '',
      });
      fetchData();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}?ref=${code}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (e) {
      console.error('Failed to copy');
    }
  };

  const handleOpenEdit = (affiliate: Affiliate) => {
    setEditingAffiliate(affiliate);
    setEditForm({
      displayName: affiliate.displayName,
      status: affiliate.status,
      firstName: affiliate.user.firstName,
      lastName: affiliate.user.lastName,
      email: affiliate.user.email,
      commissionPlanId: affiliate.currentPlan?.id?.toString() || '',
    });
    setEditError(null);
    setShowEditModal(true);
    setOpenActionMenu(null);
  };

  const handleUpdateAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAffiliate) return;

    setUpdating(true);
    setEditError(null);

    const token = localStorage.getItem('auth-token');

    try {
      const response = await apiFetch(`/api/super-admin/affiliates/${editingAffiliate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: editForm.displayName,
          status: editForm.status,
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          email: editForm.email,
          commissionPlanId: editForm.commissionPlanId ? parseInt(editForm.commissionPlanId) : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update affiliate');
      }

      setShowEditModal(false);
      setEditingAffiliate(null);
      fetchData();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenDelete = (affiliate: Affiliate) => {
    setDeletingAffiliate(affiliate);
    setDeleteError(null);
    setShowDeleteModal(true);
    setOpenActionMenu(null);
  };

  const handleDeleteAffiliate = async () => {
    if (!deletingAffiliate) return;

    setDeleting(true);
    setDeleteError(null);

    const token = localStorage.getItem('auth-token');

    try {
      const response = await apiFetch(`/api/super-admin/affiliates/${deletingAffiliate.id}`, {
        method: 'DELETE',
        headers: {
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete affiliate');
      }

      setShowDeleteModal(false);
      setDeletingAffiliate(null);
      fetchData();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setDeleting(false);
    }
  };

  // Filter affiliates
  const filteredAffiliates = affiliates.filter((a) => {
    const matchesSearch =
      a.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.refCodes.some((r) => r.refCode.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesClinic = selectedClinic === 'all' || a.clinicId === selectedClinic;

    return matchesSearch && matchesClinic;
  });

  // Get plans for selected clinic in create form
  const availablePlans = plans.filter(
    (p) => p.isActive && (!createForm.clinicId || p.clinicId === parseInt(createForm.clinicId))
  );

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
  };

  // Calculate totals
  const totals = {
    affiliates: filteredAffiliates.length,
    conversions: filteredAffiliates.reduce((sum, a) => sum + a.stats.totalConversions, 0),
    commissions: filteredAffiliates.reduce((sum, a) => sum + a.stats.totalCommissionCents, 0),
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Affiliates</h1>
          <p className="text-gray-500">Manage affiliates across all clinics</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 font-medium text-white hover:bg-[#3d8a66]"
        >
          <Plus className="h-5 w-5" />
          Add Affiliate
        </button>
      </div>

      {/* Error/Warning Banner */}
      {(fetchError || migrationNeeded) && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-xl border p-4 ${
            fetchError ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <AlertCircle
            className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
              fetchError ? 'text-red-500' : 'text-amber-500'
            }`}
          />
          <div className="flex-1">
            <p className={`font-medium ${fetchError ? 'text-red-800' : 'text-amber-800'}`}>
              {fetchError || 'Database migration may be needed'}
            </p>
            {migrationNeeded && (
              <p className="mt-1 text-sm text-amber-600">
                Run <code className="rounded bg-amber-100 px-1">npx prisma migrate deploy</code> to
                create the affiliate tables.
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className={`rounded-lg p-1.5 hover:bg-white/50 ${
              fetchError ? 'text-red-600' : 'text-amber-600'
            }`}
            title="Retry"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Cross-Clinic Analytics Dashboard */}
      <div className="mb-6">
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <BarChart3 className="h-5 w-5" />
          <span className="font-medium">Cross-Clinic Analytics</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAnalytics ? 'rotate-180' : ''}`}
          />
        </button>

        {showAnalytics && (
          <div className="space-y-4">
            {/* Period Filter */}
            <div className="flex justify-end">
              <div className="flex rounded-lg border border-gray-200 bg-white p-1">
                {(['7d', '30d', '90d', 'all'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setAnalyticsPeriod(p)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                      analyticsPeriod === p
                        ? 'bg-[#4fa77e] text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {p === 'all' ? 'All Time' : p}
                  </button>
                ))}
              </div>
            </div>

            {analyticsLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
              </div>
            ) : (
              analytics && (
                <>
                  {/* Overview Stats */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-[#4fa77e]/10 p-2 text-[#4fa77e]">
                          <Target className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">
                            {analytics.totals.totalCodes}
                          </p>
                          <p className="text-sm text-gray-500">Total Ref Codes</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                          <MousePointer className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">
                            {analytics.totals.totalClicks.toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-500">Total Clicks</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-green-100 p-2 text-green-600">
                          <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">
                            {analytics.totals.totalConversions.toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-500">Total Conversions</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600">
                          <DollarSign className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">
                            {formatCurrency(analytics.totals.totalRevenue)}
                          </p>
                          <p className="text-sm text-gray-500">Total Revenue</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Clinic Breakdown & Top Codes */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* Clinic Breakdown */}
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                          <Building2 className="h-5 w-5 text-gray-400" />
                          Performance by Clinic
                        </h3>
                      </div>
                      {analytics.clinicBreakdown.length > 0 ? (
                        <div className="space-y-3">
                          {analytics.clinicBreakdown.slice(0, 5).map((clinic, i) => (
                            <div
                              key={clinic.clinicId}
                              className="flex items-center justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span
                                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                    i === 0
                                      ? 'bg-[#4fa77e] text-white'
                                      : i === 1
                                        ? 'bg-gray-200 text-gray-700'
                                        : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {i + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-gray-900">
                                    {clinic.clinicName}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {clinic.activeAffiliates} affiliates · {clinic.totalCodes} codes
                                  </p>
                                </div>
                              </div>
                              <div className="ml-2 flex-shrink-0 text-right">
                                <p className="font-medium text-gray-900">
                                  {clinic.totalConversions}
                                </p>
                                <p className="text-xs text-green-600">
                                  {formatCurrency(clinic.totalRevenue)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-4 text-center text-gray-500">No clinic data available</p>
                      )}
                    </div>

                    {/* Top Performing Codes */}
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                          <Trophy className="h-5 w-5 text-yellow-500" />
                          Top Performing Codes
                        </h3>
                      </div>
                      {analytics.topCodes.length > 0 ? (
                        <div className="space-y-3">
                          {analytics.topCodes.slice(0, 5).map((code, i) => (
                            <div key={code.code} className="flex items-center justify-between">
                              <div className="flex min-w-0 items-center gap-3">
                                <span
                                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                    i === 0
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : i === 1
                                        ? 'bg-gray-100 text-gray-700'
                                        : i === 2
                                          ? 'bg-orange-100 text-orange-700'
                                          : 'bg-gray-50 text-gray-500'
                                  }`}
                                >
                                  {i + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-mono font-medium text-gray-900">{code.code}</p>
                                  <p className="truncate text-xs text-gray-500">
                                    {code.affiliateName} · {code.clinicName}
                                  </p>
                                </div>
                              </div>
                              <div className="ml-2 flex-shrink-0 text-right">
                                <p className="font-medium text-gray-900">{code.conversions}</p>
                                <p className="text-xs text-green-600">
                                  {formatCurrency(code.revenue)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-4 text-center text-gray-500">No code data available</p>
                      )}
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        )}
      </div>

      {/* System Diagnostics Panel */}
      <div className="mb-6">
        <button
          onClick={() => {
            setShowDiagnostics(!showDiagnostics);
            if (!showDiagnostics && !diagnostics) {
              fetchDiagnostics();
            }
          }}
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <Wrench className="h-5 w-5" />
          <span className="font-medium">System Diagnostics</span>
          {diagnostics && (
            <span
              className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                diagnostics.overallStatus === 'healthy'
                  ? 'bg-green-100 text-green-700'
                  : diagnostics.overallStatus === 'warning'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              {diagnostics.overallStatus === 'healthy'
                ? 'Healthy'
                : diagnostics.overallStatus === 'warning'
                  ? 'Needs Attention'
                  : 'Issues Found'}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showDiagnostics ? 'rotate-180' : ''}`}
          />
        </button>

        {showDiagnostics && (
          <div className="space-y-4">
            {diagnosticsLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
              </div>
            ) : diagnostics ? (
              <>
                {/* Health Checks */}
                <div className="rounded-xl bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                      <Activity className="h-5 w-5 text-gray-400" />
                      System Health Checks
                    </h3>
                    <button
                      onClick={fetchDiagnostics}
                      className="text-gray-400 hover:text-gray-600"
                      title="Refresh diagnostics"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {diagnostics.checks.map((check) => (
                      <div
                        key={check.name}
                        className={`rounded-lg border p-3 ${
                          check.status === 'healthy'
                            ? 'border-green-200 bg-green-50'
                            : check.status === 'warning'
                              ? 'border-yellow-200 bg-yellow-50'
                              : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {check.status === 'healthy' ? (
                            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
                          ) : check.status === 'warning' ? (
                            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-600" />
                          ) : (
                            <XCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{check.name}</p>
                            <p className="mt-0.5 text-xs text-gray-600">{check.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Migration Status */}
                {diagnostics.migrationStatus.unmigratedCodes.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                      <div>
                        <h4 className="font-semibold text-amber-800">Legacy Migration Needed</h4>
                        <p className="mt-1 text-sm text-amber-700">
                          {diagnostics.migrationStatus.unmigratedCodes.length} legacy Influencer
                          codes need to be migrated to the modern Affiliate system.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {diagnostics.migrationStatus.unmigratedCodes.slice(0, 5).map((code) => (
                            <span
                              key={code}
                              className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 font-mono text-xs text-amber-800"
                            >
                              {code}
                            </span>
                          ))}
                          {diagnostics.migrationStatus.unmigratedCodes.length > 5 && (
                            <span className="text-xs text-amber-600">
                              +{diagnostics.migrationStatus.unmigratedCodes.length - 5} more
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-amber-600">
                          Run:{' '}
                          <code className="rounded bg-amber-100 px-1">
                            npx tsx scripts/migrate-influencers-to-affiliates.ts
                          </code>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Activity */}
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Recent Tracking */}
                  <div className="rounded-xl bg-white p-5 shadow-sm">
                    <h4 className="mb-3 font-semibold text-gray-900">Recent Tracking (30 days)</h4>
                    {diagnostics.recentActivity.recentTouches.length > 0 ? (
                      <div className="max-h-48 space-y-2 overflow-y-auto">
                        {diagnostics.recentActivity.recentTouches.map((touch, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm"
                          >
                            <div>
                              <span className="font-mono text-gray-900">{touch.refCode}</span>
                              <span className="ml-2 text-gray-500">{touch.affiliateName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {touch.converted && (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                  Converted
                                </span>
                              )}
                              <span className="text-xs text-gray-400">
                                {new Date(touch.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No tracking activity in last 30 days</p>
                    )}
                  </div>

                  {/* Recent Referrals (Legacy) */}
                  <div className="rounded-xl bg-white p-5 shadow-sm">
                    <h4 className="mb-3 font-semibold text-gray-900">
                      Recent Intake Referrals (30 days)
                    </h4>
                    {diagnostics.recentActivity.recentReferrals.length > 0 ? (
                      <div className="max-h-48 space-y-2 overflow-y-auto">
                        {diagnostics.recentActivity.recentReferrals.map((ref, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm"
                          >
                            <div>
                              <span className="font-mono text-gray-900">{ref.promoCode}</span>
                              <span className="ml-2 text-gray-500">Patient #{ref.patientId}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {ref.hasModernAttribution ? (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                  Attributed
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                                  Not Attributed
                                </span>
                              )}
                              <span className="text-xs text-gray-400">
                                {new Date(ref.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No referrals in last 30 days</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <p className="text-gray-500">Click to load diagnostics</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#4fa77e]/10 p-2 text-[#4fa77e]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totals.affiliates}</p>
              <p className="text-sm text-gray-500">Total Affiliates</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totals.conversions}</p>
              <p className="text-sm text-gray-500">Total Conversions</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totals.commissions)}
              </p>
              <p className="text-sm text-gray-500">Total Commissions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or ref code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
        </div>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <select
            value={selectedClinic}
            onChange={(e) =>
              setSelectedClinic(e.target.value === 'all' ? 'all' : parseInt(e.target.value))
            }
            className="appearance-none rounded-lg border border-gray-200 py-2 pl-10 pr-10 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          >
            <option value="all">All Clinics</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Affiliates Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Affiliate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Clinic
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Ref Codes
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Plan
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Stats
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredAffiliates.map((affiliate) => (
              <tr key={affiliate.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{affiliate.displayName}</p>
                    <p className="text-sm text-gray-500">{affiliate.user.email}</p>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{affiliate.clinic.name}</p>
                      <p className="text-xs text-gray-500">
                        {affiliate.clinic.subdomain}.eonpro.io
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {affiliate.refCodes.slice(0, 2).map((ref) => (
                      <button
                        key={ref.id}
                        onClick={() => handleCopyCode(ref.refCode)}
                        className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200"
                      >
                        {ref.refCode}
                        {copiedCode === ref.refCode ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    ))}
                    {affiliate.refCodes.length > 2 && (
                      <span className="text-xs text-gray-400">
                        +{affiliate.refCodes.length - 2}
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  {affiliate.currentPlan ? (
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {affiliate.currentPlan.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(() => {
                          const plan = affiliate.currentPlan!;
                          const hasSeperateRates =
                            plan.initialPercentBps !== null ||
                            plan.initialFlatAmountCents !== null ||
                            plan.recurringPercentBps !== null ||
                            plan.recurringFlatAmountCents !== null;

                          if (hasSeperateRates) {
                            const initialRate =
                              plan.planType === 'PERCENT'
                                ? formatPercent(plan.initialPercentBps ?? plan.percentBps ?? 0)
                                : formatCurrency(
                                    plan.initialFlatAmountCents ?? plan.flatAmountCents ?? 0
                                  );
                            const recurringRate =
                              plan.planType === 'PERCENT'
                                ? formatPercent(plan.recurringPercentBps ?? plan.percentBps ?? 0)
                                : formatCurrency(
                                    plan.recurringFlatAmountCents ?? plan.flatAmountCents ?? 0
                                  );
                            return `${initialRate} / ${recurringRate}`;
                          }

                          return plan.planType === 'PERCENT' && plan.percentBps
                            ? formatPercent(plan.percentBps)
                            : plan.flatAmountCents
                              ? formatCurrency(plan.flatAmountCents)
                              : 'N/A';
                        })()}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">No plan</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm">
                    <p className="text-gray-900">{affiliate.stats.totalConversions} conversions</p>
                    <p className="text-gray-500">
                      {formatCurrency(affiliate.stats.totalCommissionCents)} earned
                    </p>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusColors[affiliate.status] || 'bg-gray-100 text-gray-800'}`}
                  >
                    {affiliate.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <div className="relative flex items-center justify-end gap-1">
                    <Link
                      href={`/super-admin/affiliates/${affiliate.id}`}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleOpenEdit(affiliate)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                      title="Edit affiliate"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleOpenDelete(affiliate)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      title="Delete affiliate"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAffiliates.length === 0 && (
          <div className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No affiliates found</p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="font-medium text-[#4fa77e] hover:text-[#3d8a66]"
              >
                Add your first affiliate
              </button>
              {plans.length === 0 && (
                <p className="text-sm text-gray-400">
                  Tip:{' '}
                  <Link
                    href="/super-admin/commission-plans"
                    className="text-[#4fa77e] hover:underline"
                  >
                    Create a commission plan
                  </Link>{' '}
                  first
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Create Affiliate</h2>

            <form onSubmit={handleCreateAffiliate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Clinic *</label>
                <select
                  required
                  value={createForm.clinicId}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, clinicId: e.target.value, commissionPlanId: '' }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                >
                  <option value="">Select a clinic...</option>
                  {clinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name} ({clinic.subdomain}.eonpro.io)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email *</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Password *</label>
                <input
                  type="password"
                  required
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Display Name *</label>
                <input
                  type="text"
                  required
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">First Name</label>
                  <input
                    type="text"
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Name</label>
                  <input
                    type="text"
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Initial Ref Code</label>
                <input
                  type="text"
                  value={createForm.initialRefCode}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, initialRefCode: e.target.value.toUpperCase() }))
                  }
                  placeholder="e.g., PARTNER_ABC"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Commission Plan</label>
                <select
                  value={createForm.commissionPlanId}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, commissionPlanId: e.target.value }))
                  }
                  disabled={!createForm.clinicId}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e] disabled:bg-gray-100"
                >
                  <option value="">Select a plan...</option>
                  {availablePlans.map((plan) => {
                    // Check if plan has separate initial/recurring rates
                    const hasSeperateRates =
                      plan.initialPercentBps !== null ||
                      plan.initialFlatAmountCents !== null ||
                      plan.recurringPercentBps !== null ||
                      plan.recurringFlatAmountCents !== null;

                    let rateDisplay = '';
                    if (hasSeperateRates) {
                      const initialRate =
                        plan.planType === 'PERCENT'
                          ? formatPercent(plan.initialPercentBps ?? plan.percentBps ?? 0)
                          : formatCurrency(
                              plan.initialFlatAmountCents ?? plan.flatAmountCents ?? 0
                            );
                      const recurringRate =
                        plan.planType === 'PERCENT'
                          ? formatPercent(plan.recurringPercentBps ?? plan.percentBps ?? 0)
                          : formatCurrency(
                              plan.recurringFlatAmountCents ?? plan.flatAmountCents ?? 0
                            );
                      rateDisplay = `${initialRate} init / ${recurringRate} rec`;
                    } else {
                      rateDisplay =
                        plan.planType === 'PERCENT' && plan.percentBps
                          ? formatPercent(plan.percentBps)
                          : plan.flatAmountCents
                            ? formatCurrency(plan.flatAmountCents)
                            : 'N/A';
                    }

                    return (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} ({rateDisplay})
                      </option>
                    );
                  })}
                </select>
                {!createForm.clinicId && (
                  <p className="mt-1 text-xs text-gray-500">Select a clinic first</p>
                )}
              </div>

              {createError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{createError}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-[#4fa77e] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingAffiliate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Affiliate</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleUpdateAffiliate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Display Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.displayName}
                  onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">First Name</label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Name</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Commission Plan</label>
                <select
                  value={editForm.commissionPlanId}
                  onChange={(e) => setEditForm((f) => ({ ...f, commissionPlanId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                >
                  <option value="">No plan</option>
                  {plans
                    .filter((p) => p.isActive && p.clinicId === editingAffiliate.clinicId)
                    .map((plan) => {
                      // Check if plan has separate initial/recurring rates
                      const hasSeperateRates =
                        plan.initialPercentBps !== null ||
                        plan.initialFlatAmountCents !== null ||
                        plan.recurringPercentBps !== null ||
                        plan.recurringFlatAmountCents !== null;

                      let rateDisplay = '';
                      if (hasSeperateRates) {
                        const initialRate =
                          plan.planType === 'PERCENT'
                            ? formatPercent(plan.initialPercentBps ?? plan.percentBps ?? 0)
                            : formatCurrency(
                                plan.initialFlatAmountCents ?? plan.flatAmountCents ?? 0
                              );
                        const recurringRate =
                          plan.planType === 'PERCENT'
                            ? formatPercent(plan.recurringPercentBps ?? plan.percentBps ?? 0)
                            : formatCurrency(
                                plan.recurringFlatAmountCents ?? plan.flatAmountCents ?? 0
                              );
                        rateDisplay = `${initialRate} init / ${recurringRate} rec`;
                      } else {
                        rateDisplay =
                          plan.planType === 'PERCENT' && plan.percentBps
                            ? formatPercent(plan.percentBps)
                            : plan.flatAmountCents
                              ? formatCurrency(plan.flatAmountCents)
                              : 'N/A';
                      }

                      return (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} ({rateDisplay})
                        </option>
                      );
                    })}
                </select>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">
                  <strong>Clinic:</strong> {editingAffiliate.clinic.name}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  <strong>Ref Codes:</strong>{' '}
                  {editingAffiliate.refCodes.map((r) => r.refCode).join(', ') || 'None'}
                </p>
              </div>

              {editError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{editError}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex-1 rounded-lg bg-[#4fa77e] py-2 font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingAffiliate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-center">
              <div className="rounded-full bg-red-100 p-3">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
            </div>

            <h2 className="mb-2 text-center text-xl font-bold text-gray-900">Delete Affiliate?</h2>

            <p className="mb-4 text-center text-gray-600">
              Are you sure you want to delete <strong>{deletingAffiliate.displayName}</strong>?
            </p>

            {deletingAffiliate.stats.totalConversions > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> This affiliate has{' '}
                  {deletingAffiliate.stats.totalConversions} conversion(s) and{' '}
                  {formatCurrency(deletingAffiliate.stats.totalCommissionCents)} in commissions.
                  They will be deactivated instead of permanently deleted to preserve history.
                </p>
              </div>
            )}

            {deletingAffiliate.stats.totalConversions === 0 && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800">
                  <strong>Warning:</strong> This action cannot be undone. The affiliate and their
                  user account will be permanently deleted.
                </p>
              </div>
            )}

            {deleteError && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAffiliate}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
