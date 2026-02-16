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
  }, []);

  if (isLoading) {
    return <AffiliateDashboardSkeleton />;
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
      <header className="px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <p className="mb-1 text-sm text-gray-500">{greeting}</p>
          <h1 className="text-2xl font-semibold text-gray-900">
            {displayData.affiliate.displayName || branding.affiliateName}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
        {/* Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <div className="mb-6 flex items-start justify-between">
            <div>
              <p className="mb-1 text-sm text-gray-400">Available Balance</p>
              <p className="text-4xl font-semibold tracking-tight">
                {formatCurrency(displayData.earnings.availableBalance)}
              </p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium">
              {displayData.affiliate.tier}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/affiliate/withdraw"
              className="flex-1 rounded-xl bg-white py-3 text-center font-medium text-gray-900 transition-colors hover:bg-gray-100"
            >
              Withdraw
            </Link>
            <Link
              href="/affiliate/earnings"
              className="flex-1 rounded-xl bg-white/10 py-3 text-center font-medium transition-colors hover:bg-white/20"
            >
              View Details
            </Link>
          </div>

          {displayData.earnings.pendingBalance > 0 && (
            <p className="mt-4 text-center text-sm text-gray-400">
              {formatCurrency(displayData.earnings.pendingBalance)} pending
            </p>
          )}
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-4"
        >
          <div className="rounded-2xl bg-white p-5">
            <p className="mb-1 text-sm text-gray-500">This Month</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(displayData.earnings.thisMonth)}
            </p>
            <p
              className={`mt-1 text-sm ${displayData.earnings.monthOverMonthChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {formatPercent(displayData.earnings.monthOverMonthChange)} vs last month
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5">
            <p className="mb-1 text-sm text-gray-500">Lifetime</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCompactCurrency(displayData.earnings.lifetimeEarnings)}
            </p>
            <p className="mt-1 text-sm text-gray-400">Total earned</p>
          </div>
        </motion.div>

        {/* Performance Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white p-6"
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">This Month</h2>
            <Link href="/affiliate/analytics" className="text-sm text-gray-500 hover:text-gray-700">
              View all
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {displayData.performance.clicks.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-gray-500">Clicks</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {displayData.performance.intakes.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-gray-500">Intakes</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {(displayData.performance.conversions || 0).toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-gray-500">Conversions</p>
            </div>
          </div>
        </motion.div>

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
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--brand-accent-light)' }}>
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--brand-accent-light)' }}>
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
                      style={activity.type === 'payout' ? { backgroundColor: 'var(--brand-accent-light)' } : undefined}
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
      </div>
    </div>
  );
}
