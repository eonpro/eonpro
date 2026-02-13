'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  TrendingUp,
  Link as LinkIcon,
  Copy,
  Check,
  Edit,
  Trash2,
  MoreVertical,
  MousePointer,
  Target,
  Hash,
  ExternalLink,
} from 'lucide-react';

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
    totalConversions: number;
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
  const router = useRouter();
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
      const response = await fetch(`/api/admin/affiliates/${affiliateId}`, {
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

  const handleCopyCode = async (code: string) => {
    const baseUrl = window.location.origin.replace('app.', '');
    const link = `${baseUrl}?ref=${code}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      console.error('Failed to copy');
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !affiliate) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-600">{error || 'Affiliate not found'}</p>
          <Link
            href="/admin/affiliates"
            className="mt-4 inline-flex items-center gap-2 text-violet-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Affiliates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/affiliates"
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Affiliates
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-2xl font-bold text-violet-600">
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

      {/* Stats Grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <MousePointer className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{affiliate.stats.totalClicks}</p>
              <p className="text-sm text-gray-500">Total Clicks</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{affiliate.stats.totalConversions}</p>
              <p className="text-sm text-gray-500">Conversions</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 p-2 text-violet-600">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {affiliate.stats.conversionRate.toFixed(1)}%
              </p>
              <p className="text-sm text-gray-500">Conv. Rate</p>
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
              <p className="text-sm text-gray-500">Total Earned</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Referral Codes */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Referral Codes</h2>
            {affiliate.refCodes.length === 0 ? (
              <p className="text-gray-500">No referral codes assigned</p>
            ) : (
              <div className="space-y-3">
                {affiliate.refCodes.map((code) => (
                  <div
                    key={code.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
                        <Hash className="h-5 w-5 text-violet-600" />
                      </div>
                      <div>
                        <p className="font-mono font-semibold text-gray-900">{code.refCode}</p>
                        {code.description && (
                          <p className="text-sm text-gray-500">{code.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          code.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {code.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        onClick={() => handleCopyCode(code.refCode)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Copy referral link"
                      >
                        {copiedCode === code.refCode ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Activity</h2>
            {affiliate.recentActivity.length === 0 ? (
              <p className="text-gray-500">No recent activity</p>
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
                  <p className="text-lg font-bold text-violet-600">
                    {formatPercent(affiliate.currentPlan.percentBps)} commission
                  </p>
                )}
                {affiliate.currentPlan.flatAmountCents && (
                  <p className="text-lg font-bold text-violet-600">
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
