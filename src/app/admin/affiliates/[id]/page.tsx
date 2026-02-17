'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Users,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  TrendingUp,
  Copy,
  Check,
  Edit,
  MousePointer,
  Target,
  Globe,
  ExternalLink,
  Plus,
  CreditCard,
  FileText,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ============================================================================
// Landing Page URL Builder — resolved per clinic from the current hostname
// ============================================================================

function buildLandingPageUrl(refCode: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/affiliate/${encodeURIComponent(refCode)}`;
}

interface AffiliateDetail {
  id: number;
  displayName: string;
  status: string;
  createdAt: string;
  isLegacy: boolean;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    lastLogin: string | null;
  } | null;
  refCodes: Array<{
    id: number;
    refCode: string;
    isActive: boolean;
    description?: string;
    createdAt: string;
  }>;
  currentPlan: {
    id: number;
    name: string;
    planType: string;
    flatAmountCents: number | null;
    percentBps: number | null;
  } | null;
  stats: {
    totalClicks: number;
    totalIntakes: number;
    totalConversions: number;
    totalPaymentConversions: number;
    conversionRate: number;
    totalRevenueCents: number;
    totalCommissionCents: number;
    pendingCommissionCents: number;
  };
  recentActivity: Array<{
    id: number;
    type: string;
    description: string;
    amountCents?: number;
    createdAt: string;
  }>;
  recentAttributedPatients: Array<{
    patientId: number;
    refCode: string | null;
    attributedAt: string;
  }>;
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AffiliateDetailPage() {
  const params = useParams();
  const affiliateId = params.id as string;

  const [affiliate, setAffiliate] = useState<AffiliateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchAffiliate = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await apiFetch(`/api/admin/affiliates/${affiliateId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setAffiliate(data);
      } else if (response.status === 404) {
        setError('Affiliate not found');
      } else {
        setError('Failed to load affiliate details');
      }
    } catch (err) {
      console.error('Error fetching affiliate:', err);
      setError('Failed to load affiliate details');
    } finally {
      setLoading(false);
    }
  }, [affiliateId]);

  useEffect(() => {
    fetchAffiliate();
  }, [fetchAffiliate]);

  // --- Add new ref code state ---
  const [showAddCode, setShowAddCode] = useState(false);
  const [newRefCode, setNewRefCode] = useState('');
  const [newRefDescription, setNewRefDescription] = useState('');
  const [addingCode, setAddingCode] = useState(false);
  const [addCodeError, setAddCodeError] = useState<string | null>(null);

  const handleCopyUrl = async (code: string) => {
    const link = buildLandingPageUrl(code);

    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Fallback
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

  const handleAddRefCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRefCode.trim()) return;

    setAddingCode(true);
    setAddCodeError(null);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await apiFetch(`/api/admin/affiliates/${affiliateId}/ref-codes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refCode: newRefCode.toUpperCase(),
          description: newRefDescription || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create ref code');
      }

      setNewRefCode('');
      setNewRefDescription('');
      setShowAddCode(false);
      fetchAffiliate(); // Refresh to show new code
    } catch (err) {
      setAddCodeError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAddingCode(false);
    }
  };

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

  if (error || !affiliate) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-600">{error || 'Affiliate not found'}</p>
          <button
            onClick={() => (window.location.href = '/admin/affiliates')}
            className="mt-4 inline-flex items-center gap-2 text-[var(--brand-primary)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Affiliates
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => (window.location.href = '/admin/affiliates')}
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Affiliates
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand-primary-light)] text-2xl font-bold text-[var(--brand-primary)]">
              {affiliate.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{affiliate.displayName}</h1>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${statusColors[affiliate.status] || statusColors.INACTIVE}`}
                >
                  {affiliate.status}
                </span>
                {affiliate.isLegacy && (
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                    Legacy
                  </span>
                )}
              </div>
              {affiliate.user && <p className="text-gray-500">{affiliate.user.email}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => (window.location.href = `/admin/affiliates/${affiliateId}/edit`)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Edit className="h-4 w-4" />
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid — Full funnel: Clicks → Intakes → Conversions → Revenue → Commission */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <MousePointer className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{affiliate.stats.totalClicks}</p>
              <p className="text-sm text-gray-500">Clicks</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 p-2 text-violet-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{affiliate.stats.totalIntakes ?? 0}</p>
              <p className="text-sm text-gray-500">Intakes</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{affiliate.stats.totalPaymentConversions ?? 0}</p>
              <p className="text-sm text-gray-500">Conversions</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 text-amber-600">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {(affiliate.stats.totalIntakes ?? 0) > 0
                  ? (((affiliate.stats.totalPaymentConversions ?? 0) / affiliate.stats.totalIntakes) * 100).toFixed(1)
                  : '0.0'}%
              </p>
              <p className="text-sm text-gray-500">Conv. Rate</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cyan-100 p-2 text-cyan-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(affiliate.stats.totalRevenueCents)}
              </p>
              <p className="text-sm text-gray-500">Revenue</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(affiliate.stats.totalCommissionCents)}
              </p>
              <p className="text-sm text-gray-500">Earned</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Landing Page URLs */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Landing Page URLs</h2>
              <button
                onClick={() => setShowAddCode(!showAddCode)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-primary)] px-3 py-1.5 text-sm font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-primary-light)]"
              >
                <Plus className="h-4 w-4" />
                Add URL
              </button>
            </div>

            {/* Add New URL Form */}
            {showAddCode && (
              <form
                onSubmit={handleAddRefCode}
                className="mb-5 rounded-lg border border-[var(--brand-primary-medium)] bg-[var(--brand-primary-light)] p-4"
              >
                <p className="mb-3 text-sm font-medium text-gray-700">Create New Landing Page URL</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600">URL Slug *</label>
                    <div className="mt-1 flex items-center rounded-lg border border-gray-300 bg-white focus-within:border-[var(--brand-primary)] focus-within:ring-1 focus-within:ring-[var(--brand-primary)]">
                      <span className="flex-shrink-0 pl-3 text-sm text-gray-400">/affiliate/</span>
                      <input
                        type="text"
                        required
                        value={newRefCode}
                        onChange={(e) =>
                          setNewRefCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))
                        }
                        placeholder="NEW_CODE"
                        className="w-full border-0 bg-transparent px-1 py-2 font-mono text-sm focus:outline-none focus:ring-0"
                      />
                    </div>
                    {newRefCode && (
                      <div className="mt-1.5 flex items-center gap-1.5 rounded bg-white px-2 py-1">
                        <Globe className="h-3 w-3 text-[var(--brand-primary)]" />
                        <span className="truncate font-mono text-xs text-[var(--brand-primary)]">
                          {buildLandingPageUrl(newRefCode)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">
                      Description (optional)
                    </label>
                    <input
                      type="text"
                      value={newRefDescription}
                      onChange={(e) => setNewRefDescription(e.target.value)}
                      placeholder="e.g., Instagram campaign"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </div>
                  {addCodeError && (
                    <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                      {addCodeError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCode(false);
                        setAddCodeError(null);
                        setNewRefCode('');
                        setNewRefDescription('');
                      }}
                      className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addingCode || !newRefCode.trim()}
                      className="rounded-lg bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white hover:brightness-90 disabled:opacity-50"
                    >
                      {addingCode ? 'Creating...' : 'Create URL'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* URL Cards */}
            {affiliate.refCodes.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
                <Globe className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No landing page URLs yet</p>
                <button
                  onClick={() => setShowAddCode(true)}
                  className="mt-3 text-sm font-medium text-[var(--brand-primary)] hover:underline"
                >
                  Create the first one
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {affiliate.refCodes.map((code) => {
                  const url = buildLandingPageUrl(code.refCode);
                  return (
                    <div
                      key={code.id}
                      className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300"
                    >
                      {/* Top row: code + status + actions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-primary-light)]">
                            <Globe className="h-4 w-4 text-[var(--brand-primary)]" />
                          </div>
                          <div>
                            <p className="font-mono text-sm font-semibold text-gray-900">
                              {code.refCode}
                            </p>
                            {code.description && (
                              <p className="text-xs text-gray-500">{code.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              code.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {code.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {formatDate(code.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* URL row */}
                      <div className="mt-3 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
                        <span className="flex-1 truncate font-mono text-xs text-gray-600">
                          {url}
                        </span>
                        <button
                          onClick={() => handleCopyUrl(code.refCode)}
                          className="flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                          title="Copy landing page URL"
                        >
                          {copiedCode === code.refCode ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <Check className="h-3 w-3" /> Copied
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Copy className="h-3 w-3" /> Copy
                            </span>
                          )}
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-primary-light)]"
                          title="Preview landing page"
                        >
                          <span className="flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> Preview
                          </span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Attributed Patients */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-violet-500" />
              <h2 className="text-lg font-semibold text-gray-900">Attributed Patients</h2>
              <span className="ml-auto rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                {affiliate.stats.totalIntakes ?? 0}
              </span>
            </div>
            {(!affiliate.recentAttributedPatients || affiliate.recentAttributedPatients.length === 0) ? (
              <p className="text-gray-500">No patients attributed yet</p>
            ) : (
              <div className="space-y-3">
                {affiliate.recentAttributedPatients.map((p) => (
                  <a
                    key={p.patientId}
                    href={`/patients/${p.patientId}`}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-600">
                        #{p.patientId}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Patient #{p.patientId}</p>
                        <p className="text-xs text-gray-500">{formatDate(p.attributedAt)}</p>
                      </div>
                    </div>
                    {p.refCode && (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
                        {p.refCode}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Recent Commission Activity */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Commission Activity</h2>
            {affiliate.recentActivity.length === 0 ? (
              <p className="text-gray-500">No commission activity yet</p>
            ) : (
              <div className="space-y-4">
                {affiliate.recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start justify-between border-b border-gray-100 pb-4 last:border-0"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{activity.description}</p>
                      <p className="text-sm text-gray-500">{formatDateTime(activity.createdAt)}</p>
                    </div>
                    {activity.amountCents !== undefined && (
                      <span className="font-semibold text-green-600">
                        +{formatCurrency(activity.amountCents)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details Card */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Details</h2>
            <div className="space-y-4">
              {affiliate.user && (
                <>
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{affiliate.user.email}</span>
                  </div>
                  {affiliate.user.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{affiliate.user.phone}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Joined {formatDate(affiliate.createdAt)}
                </span>
              </div>
              {affiliate.user?.lastLogin && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Last login {formatDateTime(affiliate.user.lastLogin)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Commission Plan Card */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Commission Plan</h2>
            {affiliate.currentPlan ? (
              <div className="space-y-3">
                <p className="font-medium text-gray-900">{affiliate.currentPlan.name}</p>
                <p className="text-sm text-gray-500">{affiliate.currentPlan.planType}</p>
                {affiliate.currentPlan.percentBps && (
                  <p className="text-lg font-bold text-[var(--brand-primary)]">
                    {formatPercent(affiliate.currentPlan.percentBps)} commission
                  </p>
                )}
                {affiliate.currentPlan.flatAmountCents && (
                  <p className="text-lg font-bold text-[var(--brand-primary)]">
                    {formatCurrency(affiliate.currentPlan.flatAmountCents)} per sale
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No commission plan assigned</p>
            )}
          </div>

          {/* Earnings Card */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Earnings</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Revenue</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(affiliate.stats.totalRevenueCents)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Commission</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(affiliate.stats.totalCommissionCents)}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-3">
                <span className="text-gray-500">Pending Payout</span>
                <span className="font-semibold text-yellow-600">
                  {formatCurrency(affiliate.stats.pendingCommissionCents)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
