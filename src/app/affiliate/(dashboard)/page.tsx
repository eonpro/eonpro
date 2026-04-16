'use client';

/**
 * Affiliate Dashboard Home
 *
 * Clean, minimal dashboard with key metrics at a glance.
 * Real-time earnings, quick actions, and performance overview.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { AffiliateDashboardSkeleton } from '@/components/dashboards/AffiliateDashboardSkeleton';
import { apiFetch } from '@/lib/api/fetch';
import { useBranding } from './branding-context';

interface OnboardingStatus {
  hasPayoutMethod: boolean;
  hasTaxInfo: boolean;
  hasRefCodes: boolean;
  hasClicks: boolean;
}

interface DashboardData {
  affiliate: {
    displayName: string;
    tier: string;
    tierProgress: number;
  };
  earnings: {
    availableBalance: number;
    pendingBalance: number;
    lifetimeEarnings: number;
    thisMonth: number;
    lastMonth: number;
    monthOverMonthChange: number;
  };
  performance: {
    clicks: number;
    intakes: number;
    conversions: number;
    intakeRate: number;
    avgOrderValue: number;
    lifetimeIntakes: number;
  };
  recentActivity: Array<{
    id: string;
    type: 'conversion' | 'payout' | 'click';
    amount?: number;
    createdAt: string;
    description: string;
  }>;
}

// Format currency
const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

// Format compact currency for large numbers
const formatCompactCurrency = (cents: number) => {
  const dollars = cents / 100;
  if (dollars >= 10000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(dollars);
  }
  return formatCurrency(cents);
};

// Format percentage
const formatPercent = (value: number) => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

// Format relative time
const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

export default function AffiliateDashboard() {
  const branding = useBranding();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('');
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [dismissedOnboarding, setDismissedOnboarding] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await apiFetch('/api/affiliate/dashboard');
        if (res.ok) {
          const dashboardData = await res.json();
          setData(dashboardData);
        } else {
          const errorData = await res.json().catch(() => ({}));
          setError((errorData.error as string) || 'Failed to load dashboard');
        }
      } catch {
        setError('Failed to connect to server');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();

    const fetchOnboarding = async () => {
      try {
        const [accountRes, refCodesRes] = await Promise.all([
          apiFetch('/api/affiliate/account').catch(() => null),
          apiFetch('/api/affiliate/ref-codes').catch(() => null),
        ]);
        const acct = accountRes?.ok ? await accountRes.json() : null;
        const refs = refCodesRes?.ok ? await refCodesRes.json() : null;
        setOnboarding({
          hasPayoutMethod: !!(acct?.payoutMethod && acct.payoutMethod.type !== 'none'),
          hasTaxInfo: !!acct?.taxStatus?.hasValidW9,
          hasRefCodes: (refs?.refCodes?.length || 0) > 0,
          hasClicks: false,
        });
      } catch {
        /* non-critical */
      }
    };
    fetchOnboarding();
  }, []);

  if (isLoading) {
    return <AffiliateDashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Unable to load dashboard</h2>
          <p className="mb-6 text-sm text-gray-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Default data for affiliates with no activity yet
  const displayData: DashboardData = data || {
    affiliate: {
      displayName: 'Partner',
      tier: 'Standard',
      tierProgress: 0,
    },
    earnings: {
      availableBalance: 0,
      pendingBalance: 0,
      lifetimeEarnings: 0,
      thisMonth: 0,
      lastMonth: 0,
      monthOverMonthChange: 0,
    },
    performance: {
      clicks: 0,
      intakes: 0,
      conversions: 0,
      intakeRate: 0,
      avgOrderValue: 0,
      lifetimeIntakes: 0,
    },
    recentActivity: [],
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-4 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-3xl">
          <p className="mb-1 text-sm text-gray-500">{greeting}</p>
          <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
            {displayData.affiliate.displayName || branding.affiliateName}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 sm:space-y-6 sm:px-6 sm:py-6">
        {/* Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 text-white sm:p-6"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <div className="mb-4 flex items-start justify-between sm:mb-6">
            <div>
              <p className="mb-1 text-sm text-gray-400">Available Balance</p>
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {formatCurrency(displayData.earnings.availableBalance)}
              </p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium sm:text-sm">
              {displayData.affiliate.tier}
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/affiliate/withdraw"
              className="flex-1 rounded-xl bg-white py-2.5 text-center text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 sm:py-3 sm:text-base"
            >
              Withdraw
            </Link>
            <Link
              href="/affiliate/earnings"
              className="flex-1 rounded-xl bg-white/10 py-2.5 text-center text-sm font-medium transition-colors hover:bg-white/20 sm:py-3 sm:text-base"
            >
              View Details
            </Link>
          </div>

          {displayData.earnings.pendingBalance > 0 && (
            <p className="mt-3 text-center text-sm text-gray-400 sm:mt-4">
              {formatCurrency(displayData.earnings.pendingBalance)} pending
            </p>
          )}
        </motion.div>

        {/* Onboarding Checklist */}
        {onboarding &&
          !dismissedOnboarding &&
          (() => {
            const hasClicks = (displayData.performance.clicks || 0) > 0;
            const steps = [
              {
                done: onboarding.hasRefCodes,
                label: 'Copy your referral link',
                href: '/affiliate/links',
              },
              {
                done: onboarding.hasPayoutMethod,
                label: 'Set up payout method',
                href: '/affiliate/account/payout-method',
              },
              {
                done: onboarding.hasTaxInfo,
                label: 'Submit tax information (W-9)',
                href: '/affiliate/account/tax',
              },
              { done: hasClicks, label: 'Get your first click', href: '/affiliate/links' },
            ];
            const completedCount = steps.filter((s) => s.done).length;
            if (completedCount === steps.length) return null;
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-2xl bg-white p-5 sm:p-6"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 sm:text-base">
                      Get started
                    </h2>
                    <p className="text-xs text-gray-500">
                      {completedCount} of {steps.length} complete
                    </p>
                  </div>
                  <button
                    onClick={() => setDismissedOnboarding(true)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                    aria-label="Dismiss checklist"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="mb-3 h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${(completedCount / steps.length) * 100}%`,
                      backgroundColor: 'var(--brand-primary)',
                    }}
                  />
                </div>
                <div className="space-y-2">
                  {steps.map((step) => (
                    <a
                      key={step.label}
                      href={step.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${step.done ? 'text-gray-400' : 'text-gray-900 hover:bg-gray-50'}`}
                    >
                      {step.done ? (
                        <svg
                          className="h-5 w-5 flex-shrink-0 text-green-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-gray-300" />
                      )}
                      <span className={step.done ? 'line-through' : 'font-medium'}>
                        {step.label}
                      </span>
                    </a>
                  ))}
                </div>
              </motion.div>
            );
          })()}

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3 sm:gap-4"
        >
          <div className="rounded-2xl bg-white p-4 sm:p-5">
            <p className="mb-1 text-xs text-gray-500 sm:text-sm">This Month</p>
            <p className="text-xl font-semibold text-gray-900 sm:text-2xl">
              {formatCurrency(displayData.earnings.thisMonth)}
            </p>
            <p
              className={`mt-1 text-xs sm:text-sm ${displayData.earnings.monthOverMonthChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {formatPercent(displayData.earnings.monthOverMonthChange)} vs last month
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 sm:p-5">
            <p className="mb-1 text-xs text-gray-500 sm:text-sm">Lifetime</p>
            <p className="text-xl font-semibold text-gray-900 sm:text-2xl">
              {formatCompactCurrency(displayData.earnings.lifetimeEarnings)}
            </p>
            <p className="mt-1 text-xs text-gray-400 sm:text-sm">Total earned</p>
          </div>
        </motion.div>

        {/* Performance Overview */}
        <Link href="/affiliate/analytics" className="block">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl bg-white p-5 transition-shadow hover:shadow-sm sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between sm:mb-6">
              <h2 className="text-sm font-semibold text-gray-900 sm:text-base">This Month</h2>
              <span className="text-xs text-gray-500 sm:text-sm">View all &rarr;</span>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-6">
              <div className="text-center">
                <p className="text-xl font-semibold text-gray-900 sm:text-2xl">
                  {displayData.performance.clicks.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">Clicks</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-gray-900 sm:text-2xl">
                  {displayData.performance.intakes.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">Intakes</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-gray-900 sm:text-2xl">
                  {(displayData.performance.conversions || 0).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">Conversions</p>
              </div>
            </div>
          </motion.div>
        </Link>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="divide-y divide-gray-100 rounded-2xl bg-white"
        >
          <Link
            href="/affiliate/links"
            className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center gap-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--brand-accent-light)' }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: 'var(--brand-accent)' }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Copy your link</p>
                <p className="text-sm text-gray-500">Share and start earning</p>
              </div>
            </div>
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <Link
            href="/affiliate/resources"
            className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center gap-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--brand-accent-light)' }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: 'var(--brand-accent)' }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Marketing materials</p>
                <p className="text-sm text-gray-500">Banners, copy, and more</p>
              </div>
            </div>
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <Link
            href="/affiliate/help"
            className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
                <svg
                  className="h-5 w-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Get help</p>
                <p className="text-sm text-gray-500">FAQs and support</p>
              </div>
            </div>
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>

        {/* Recent Activity */}
        {displayData.recentActivity.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl bg-white p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Recent Activity</h2>
              <Link
                href="/affiliate/activity"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                View all
              </Link>
            </div>

            <div className="space-y-4">
              {displayData.recentActivity.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        activity.type === 'conversion'
                          ? 'bg-green-50'
                          : activity.type === 'click'
                            ? 'bg-gray-50'
                            : ''
                      }`}
                      style={
                        activity.type === 'payout'
                          ? { backgroundColor: 'var(--brand-accent-light)' }
                          : undefined
                      }
                    >
                      {activity.type === 'conversion' && (
                        <svg
                          className="h-4 w-4 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          />
                        </svg>
                      )}
                      {activity.type === 'payout' && (
                        <svg
                          className="h-4 w-4"
                          style={{ color: 'var(--brand-accent)' }}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 10l7-7m0 0l7 7m-7-7v18"
                          />
                        </svg>
                      )}
                      {activity.type === 'click' && (
                        <svg
                          className="h-4 w-4 text-gray-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                          />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                      <p className="text-xs text-gray-500">
                        {formatRelativeTime(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                  {activity.amount && (
                    <span
                      className={`font-medium ${activity.type === 'payout' ? 'text-gray-900' : 'text-green-600'}`}
                    >
                      {activity.type === 'payout' ? '-' : '+'}
                      {formatCurrency(activity.amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Spacer for mobile bottom nav */}
        <div className="h-4 sm:h-0" />
      </div>
    </div>
  );
}
