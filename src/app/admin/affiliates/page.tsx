'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Search,
  DollarSign,
  TrendingUp,
  Eye,
  Copy,
  Check,
  BarChart3,
  Target,
  ExternalLink,
  Globe,
  CheckCircle,
  MousePointer,
  FileText,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ============================================================================
// Landing Page URL Builder
// ============================================================================

const LANDING_PAGE_BASE = 'https://ot.eonpro.io/affiliate';

function buildLandingPageUrl(refCode: string): string {
  return `${LANDING_PAGE_BASE}/${encodeURIComponent(refCode)}`;
}

interface Affiliate {
  id: number;
  displayName: string;
  status: string;
  createdAt: string;
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
    totalClicks: number;
    totalIntakes: number;
    totalPaymentConversions: number;
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

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create form state
  const [createForm, setCreateForm] = useState({
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
  const [createSuccess, setCreateSuccess] = useState<{
    displayName: string;
    refCode: string;
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const [affiliatesRes, plansRes] = await Promise.all([
        apiFetch('/api/admin/affiliates', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        apiFetch('/api/admin/commission-plans', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (affiliatesRes.ok) {
        const data = await affiliatesRes.json();
        setAffiliates(data.affiliates);
      }

      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans.filter((p: CommissionPlan) => p.isActive));
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await apiFetch('/api/admin/affiliates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...createForm,
          commissionPlanId: createForm.commissionPlanId
            ? parseInt(createForm.commissionPlanId)
            : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create affiliate');
      }

      const result = await response.json();
      const createdRefCode =
        createForm.initialRefCode ||
        result?.affiliate?.refCodes?.[0]?.refCode ||
        '';

      // Show success state with URL if ref code exists
      if (createdRefCode) {
        setCreateSuccess({
          displayName: createForm.displayName,
          refCode: createdRefCode,
        });
      } else {
        setShowCreateModal(false);
      }

      setCreateForm({
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

  const handleCopyUrl = async (code: string) => {
    const link = buildLandingPageUrl(code);

    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Fallback: select text
      const textarea = document.createElement('textarea');
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const filteredAffiliates = affiliates.filter(
    (a) =>
      a.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.refCodes.some((r) => r.refCode.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliates</h1>
          <p className="text-gray-500">Manage your affiliate partners</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/admin/affiliates/reports"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            <BarChart3 className="h-5 w-5" />
            Reports
          </a>
          <a
            href="/admin/affiliates/code-performance"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            <Target className="h-5 w-5" />
            Code Performance
          </a>
          <a
            href="/admin/affiliates/commission-plans"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            <DollarSign className="h-5 w-5" />
            Plans
          </a>
          <a
            href="/admin/affiliates/applications"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--brand-primary)] px-4 py-2 font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-primary-light)]"
          >
            <Users className="h-5 w-5" />
            Applications
          </a>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 font-medium text-white hover:brightness-90"
          >
            <Plus className="h-5 w-5" />
            Add Affiliate
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gray-100 p-2 text-gray-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{affiliates.length}</p>
              <p className="text-sm text-gray-500">Affiliates</p>
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
                {affiliates.reduce((sum, a) => sum + (a.stats.totalClicks ?? 0), 0)}
              </p>
              <p className="text-sm text-gray-500">Total Clicks</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 p-2 text-violet-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {affiliates.reduce((sum, a) => sum + (a.stats.totalIntakes ?? 0), 0)}
              </p>
              <p className="text-sm text-gray-500">Total Intakes</p>
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
                {affiliates.reduce((sum, a) => sum + (a.stats.totalPaymentConversions ?? 0), 0)}
              </p>
              <p className="text-sm text-gray-500">Conversions</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(
                  affiliates.reduce((sum, a) => sum + a.stats.totalCommissionCents, 0)
                )}
              </p>
              <p className="text-sm text-gray-500">Commission</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or ref code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
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
                <td className="px-6 py-4">
                  <div className="space-y-1.5">
                    {affiliate.refCodes.slice(0, 3).map((ref) => (
                      <div key={ref.id} className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyUrl(ref.refCode)}
                          className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200"
                          title={`Copy: ${buildLandingPageUrl(ref.refCode)}`}
                        >
                          {ref.refCode}
                          {copiedCode === ref.refCode ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                        <a
                          href={buildLandingPageUrl(ref.refCode)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-[var(--brand-primary)]"
                          title="Preview landing page"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                    {affiliate.refCodes.length > 3 && (
                      <span className="text-xs text-gray-400">
                        +{affiliate.refCodes.length - 3} more
                      </span>
                    )}
                    {affiliate.refCodes.length > 0 && (
                      <p className="truncate text-[10px] text-gray-400" style={{ maxWidth: '200px' }}>
                        {buildLandingPageUrl(affiliate.refCodes[0].refCode)}
                      </p>
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
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500" title="Clicks">{affiliate.stats.totalClicks ?? 0} <span className="text-xs">clicks</span></span>
                      <span className="text-violet-600" title="Intakes">{affiliate.stats.totalIntakes ?? 0} <span className="text-xs">intakes</span></span>
                      <span className="text-green-600" title="Conversions">{affiliate.stats.totalPaymentConversions ?? 0} <span className="text-xs">conv</span></span>
                    </div>
                    <p className="mt-0.5 text-gray-500">
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
                  <a
                    href={`/admin/affiliates/${affiliate.id}`}
                    className="inline-flex rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Eye className="h-5 w-5" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAffiliates.length === 0 && (
          <div className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No affiliates found</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">

            {/* ---- Success State ---- */}
            {createSuccess ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Affiliate Created</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {createSuccess.displayName} is ready to go.
                  </p>
                </div>

                {/* Landing Page URL */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Landing Page URL
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <Globe className="h-4 w-4 flex-shrink-0 text-[var(--brand-primary)]" />
                    <span className="flex-1 truncate font-mono text-sm text-gray-800">
                      {buildLandingPageUrl(createSuccess.refCode)}
                    </span>
                    <button
                      onClick={() => handleCopyUrl(createSuccess.refCode)}
                      className="flex-shrink-0 rounded-md bg-[var(--brand-primary)] px-3 py-1 text-xs font-medium text-white hover:brightness-90"
                    >
                      {copiedCode === createSuccess.refCode ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <a
                    href={buildLandingPageUrl(createSuccess.refCode)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-[var(--brand-primary)] hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Preview landing page
                  </a>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setCreateSuccess(null);
                      // Keep modal open for another creation
                    }}
                    className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Create Another
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreateSuccess(null);
                    }}
                    className="flex-1 rounded-lg bg-[var(--brand-primary)] py-2 font-medium text-white hover:brightness-90"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* ---- Create Form ---- */
              <>
                <h2 className="mb-4 text-xl font-bold text-gray-900">Create Affiliate</h2>

                <form onSubmit={handleCreateAffiliate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email *</label>
                    <input
                      type="email"
                      required
                      value={createForm.email}
                      onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Password *</label>
                    <input
                      type="password"
                      required
                      value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Display Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={createForm.displayName}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, displayName: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">First Name</label>
                      <input
                        type="text"
                        value={createForm.firstName}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, firstName: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Last Name</label>
                      <input
                        type="text"
                        value={createForm.lastName}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, lastName: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                  </div>

                  {/* Ref Code with live URL preview */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Landing Page URL Slug
                    </label>
                    <div className="mt-1 flex items-center rounded-lg border border-gray-300 focus-within:border-[var(--brand-primary)] focus-within:ring-1 focus-within:ring-[var(--brand-primary)]">
                      <span className="flex-shrink-0 pl-3 text-sm text-gray-400">
                        /affiliate/
                      </span>
                      <input
                        type="text"
                        value={createForm.initialRefCode}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            initialRefCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                          }))
                        }
                        placeholder="PARTNER_ABC"
                        className="w-full border-0 bg-transparent px-1 py-2 font-mono focus:outline-none focus:ring-0"
                      />
                    </div>
                    {createForm.initialRefCode && (
                      <div className="mt-2 flex items-center gap-2 rounded-md bg-[var(--brand-primary-light)] px-3 py-2">
                        <Globe className="h-3.5 w-3.5 flex-shrink-0 text-[var(--brand-primary)]" />
                        <span className="truncate font-mono text-xs text-[var(--brand-primary)]">
                          {buildLandingPageUrl(createForm.initialRefCode)}
                        </span>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      This becomes the affiliate&apos;s personalized landing page URL
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Commission Plan
                    </label>
                    <select
                      value={createForm.commissionPlanId}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, commissionPlanId: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    >
                      <option value="">Select a plan...</option>
                      {plans.map((plan) => {
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
                          rateDisplay = `${initialRate} initial / ${recurringRate} recurring`;
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

                  {createError && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                      {createError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setCreateError(null);
                      }}
                      className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="flex-1 rounded-lg bg-[var(--brand-primary)] py-2 font-medium text-white hover:brightness-90 disabled:opacity-50"
                    >
                      {creating ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
