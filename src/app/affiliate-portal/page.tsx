'use client';

import { useEffect, useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  Users,
  Clock,
  MousePointerClick,
  ClipboardCheck,
  ArrowUpRight,
  Copy,
  Check,
  ArrowRight,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface SummaryData {
  summary: {
    clicksCount: number;
    intakesCount: number;
    conversionsCount: number;
    revenueTotalCents: number;
    commissionPendingCents: number;
    commissionApprovedCents: number;
    commissionPaidCents: number;
    commissionReversedCents: number;
    pendingCount: number;
    approvedCount: number;
    paidCount: number;
    reversedCount: number;
  };
  refCodes: Array<{
    refCode: string;
    description: string | null;
    createdAt: string;
  }>;
  currentPlan: {
    name: string;
    planType: string;
    flatAmountCents: number | null;
    percentBps: number | null;
    appliesTo: string;
  } | null;
}

interface TrendData {
  trends: Array<{
    date: string;
    conversions: number | string;
    revenueCents: number | null;
    commissionCents: number | null;
  }>;
  totals: {
    conversions: number;
    revenueCents: number;
    commissionCents: number;
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

function calcRate(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function AffiliateDashboard() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [summaryRes, trendsRes] = await Promise.all([
          apiFetch('/api/affiliate/summary'),
          apiFetch('/api/affiliate/trends?granularity=week'),
        ]);

        if (summaryRes.ok) {
          setSummary(await summaryRes.json());
        }
        if (trendsRes.ok) {
          setTrends(await trendsRes.json());
        }
      } catch (error) {
        // Non-critical: dashboard still renders with null state
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCopyCode = async (code: string) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}?ref=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
      </div>
    );
  }

  const s = summary?.summary;
  const totalEarnings = s
    ? s.commissionPendingCents + s.commissionApprovedCents + s.commissionPaidCents
    : 0;

  const clicks = s?.clicksCount ?? 0;
  const intakes = s?.intakesCount ?? 0;
  const conversions = s?.conversionsCount ?? 0;

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 lg:text-3xl">Affiliate Dashboard</h1>
        <p className="mt-1 text-gray-500">Track your performance and earnings</p>
      </div>

      {/* Funnel Stats - Clicks → Intakes → Conversions */}
      <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Referral Funnel
        </h2>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-0">
          {/* Clicks */}
          <div className="flex flex-1 items-center gap-3 rounded-xl bg-purple-50 px-4 py-4">
            <div className="rounded-lg bg-purple-100 p-2">
              <MousePointerClick className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{clicks.toLocaleString()}</p>
              <p className="text-xs font-medium text-gray-500">Clicks</p>
            </div>
          </div>
          <div className="hidden items-center px-2 text-gray-300 sm:flex">
            <ArrowRight className="h-5 w-5" />
          </div>
          {/* Intakes */}
          <div className="flex flex-1 items-center gap-3 rounded-xl bg-blue-50 px-4 py-4">
            <div className="rounded-lg bg-blue-100 p-2">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{intakes.toLocaleString()}</p>
              <p className="text-xs font-medium text-gray-500">Intakes</p>
            </div>
            {clicks > 0 && (
              <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                {calcRate(intakes, clicks)}
              </span>
            )}
          </div>
          <div className="hidden items-center px-2 text-gray-300 sm:flex">
            <ArrowRight className="h-5 w-5" />
          </div>
          {/* Conversions (Paid) */}
          <div className="flex flex-1 items-center gap-3 rounded-xl bg-green-50 px-4 py-4">
            <div className="rounded-lg bg-green-100 p-2">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{conversions.toLocaleString()}</p>
              <p className="text-xs font-medium text-gray-500">Conversions</p>
            </div>
            {intakes > 0 && (
              <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                {calcRate(conversions, intakes)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Earnings Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total Earnings */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-white/20 p-2">
              <DollarSign className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-white/80">All Time</span>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold">{formatCurrency(totalEarnings)}</p>
            <p className="mt-1 text-sm text-white/80">Total Earnings</p>
          </div>
        </div>

        {/* Pending */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-yellow-100 p-2 text-yellow-600">
              <Clock className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-gray-400">
              {s?.pendingCount || 0} pending
            </span>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(s?.commissionPendingCents || 0)}
            </p>
            <p className="mt-1 text-sm text-gray-500">Pending Commissions</p>
          </div>
        </div>

        {/* Ready for Payout */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-blue-100 p-2 text-blue-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-blue-600">Ready</span>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(s?.commissionApprovedCents || 0)}
            </p>
            <p className="mt-1 text-sm text-gray-500">Ready for payout</p>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Performance */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Weekly Performance</h2>
          {trends && trends.trends.length > 0 ? (
            <div className="space-y-3">
              {trends.trends.slice(0, 8).map((week) => (
                <div
                  key={week.date}
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      Week of{' '}
                      {new Date(week.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-sm text-gray-500">
                      {typeof week.conversions === 'number'
                        ? `${week.conversions} conversions`
                        : `${week.conversions} conversions`}
                    </p>
                  </div>
                  <div className="text-right">
                    {week.commissionCents !== null ? (
                      <p className="font-semibold text-green-600">
                        +{formatCurrency(week.commissionCents)}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400">Suppressed</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl bg-gray-50">
              <p className="text-gray-400">No data yet</p>
            </div>
          )}
        </div>

        {/* Referral Links */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Your Referral Links</h2>
            <a
              href="/portal/affiliate/ref-codes"
              className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
            >
              Manage
            </a>
          </div>
          {summary?.refCodes && summary.refCodes.length > 0 ? (
            <div className="space-y-3">
              {summary.refCodes.slice(0, 5).map((ref) => (
                <div
                  key={ref.refCode}
                  className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-medium text-gray-900">{ref.refCode}</p>
                    {ref.description && (
                      <p className="truncate text-sm text-gray-500">{ref.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleCopyCode(ref.refCode)}
                    className="ml-4 flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    {copiedCode === ref.refCode ? (
                      <>
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-green-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl bg-gray-50">
              <p className="text-gray-400">No referral codes yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Commission Plan Info */}
      {summary?.currentPlan && (
        <div className="mt-6 rounded-2xl bg-gradient-to-r from-gray-50 to-gray-100 p-6">
          <h3 className="mb-2 font-semibold text-gray-900">
            Your Commission Plan: {summary.currentPlan.name}
          </h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="rounded-lg bg-white px-3 py-1.5 shadow-sm">
              <span className="text-gray-500">Rate:</span>{' '}
              <span className="font-medium text-gray-900">
                {summary.currentPlan.planType === 'PERCENT' && summary.currentPlan.percentBps
                  ? formatPercent(summary.currentPlan.percentBps)
                  : summary.currentPlan.flatAmountCents
                    ? formatCurrency(summary.currentPlan.flatAmountCents)
                    : 'N/A'}
              </span>
            </div>
            <div className="rounded-lg bg-white px-3 py-1.5 shadow-sm">
              <span className="text-gray-500">Applies to:</span>{' '}
              <span className="font-medium text-gray-900">
                {summary.currentPlan.appliesTo === 'FIRST_PAYMENT_ONLY'
                  ? 'First payment only'
                  : 'All payments'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Note */}
      <div className="mt-6 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
        <p>
          <strong>Privacy Note:</strong> For compliance, we only show aggregated metrics. Individual
          conversion details with fewer than 5 entries are displayed as &quot;&lt;5&quot; to protect
          customer privacy.
        </p>
      </div>
    </div>
  );
}
