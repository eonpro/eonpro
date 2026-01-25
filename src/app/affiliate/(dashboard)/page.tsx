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
    conversions: number;
    conversionRate: number;
    avgOrderValue: number;
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
        const res = await fetch('/api/affiliate/dashboard', {
          credentials: 'include',
        });
        if (res.ok) {
          const dashboardData = await res.json();
          setData(dashboardData);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error('Dashboard API error:', res.status, errorData);
          setError(errorData.error || 'Failed to load dashboard');
        }
      } catch (err) {
        console.error('Failed to fetch dashboard:', err);
        setError('Failed to connect to server');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
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
      conversions: 0,
      conversionRate: 0,
      avgOrderValue: 0,
    },
    recentActivity: [],
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-6 py-6 border-b border-gray-100">
        <div className="max-w-3xl mx-auto">
          <p className="text-gray-500 text-sm mb-1">{greeting}</p>
          <h1 className="text-2xl font-semibold text-gray-900">
            {displayData.affiliate.displayName}
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 text-white rounded-2xl p-6"
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-gray-400 text-sm mb-1">Available Balance</p>
              <p className="text-4xl font-semibold tracking-tight">
                {formatCurrency(displayData.earnings.availableBalance)}
              </p>
            </div>
            <span className="px-3 py-1 bg-white/10 rounded-full text-sm font-medium">
              {displayData.affiliate.tier}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <Link
              href="/affiliate/withdraw"
              className="flex-1 py-3 bg-white text-gray-900 font-medium rounded-xl text-center
                       hover:bg-gray-100 transition-colors"
            >
              Withdraw
            </Link>
            <Link
              href="/affiliate/earnings"
              className="flex-1 py-3 bg-white/10 font-medium rounded-xl text-center
                       hover:bg-white/20 transition-colors"
            >
              View Details
            </Link>
          </div>

          {displayData.earnings.pendingBalance > 0 && (
            <p className="mt-4 text-gray-400 text-sm text-center">
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
          <div className="bg-white rounded-2xl p-5">
            <p className="text-gray-500 text-sm mb-1">This Month</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(displayData.earnings.thisMonth)}
            </p>
            <p className={`text-sm mt-1 ${displayData.earnings.monthOverMonthChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercent(displayData.earnings.monthOverMonthChange)} vs last month
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5">
            <p className="text-gray-500 text-sm mb-1">Lifetime</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCompactCurrency(displayData.earnings.lifetimeEarnings)}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Total earned
            </p>
          </div>
        </motion.div>

        {/* Performance Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
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
              <p className="text-gray-500 text-sm mt-1">Clicks</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {displayData.performance.conversions}
              </p>
              <p className="text-gray-500 text-sm mt-1">Conversions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-gray-900">
                {displayData.performance.conversionRate}%
              </p>
              <p className="text-gray-500 text-sm mt-1">Conv. Rate</p>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl divide-y divide-gray-100"
        >
          <Link
            href="/affiliate/links"
            className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Copy your link</p>
                <p className="text-sm text-gray-500">Share and start earning</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          
          <Link
            href="/affiliate/resources"
            className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Marketing materials</p>
                <p className="text-sm text-gray-500">Banners, copy, and more</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          
          <Link
            href="/affiliate/help"
            className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Get help</p>
                <p className="text-sm text-gray-500">FAQs and support</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="bg-white rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Recent Activity</h2>
              <Link href="/affiliate/activity" className="text-sm text-gray-500 hover:text-gray-700">
                View all
              </Link>
            </div>
            
            <div className="space-y-4">
              {displayData.recentActivity.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center
                      ${activity.type === 'conversion' ? 'bg-green-50' : 
                        activity.type === 'payout' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      {activity.type === 'conversion' && (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      )}
                      {activity.type === 'payout' && (
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                      )}
                      {activity.type === 'click' && (
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                      <p className="text-xs text-gray-500">{formatRelativeTime(activity.createdAt)}</p>
                    </div>
                  </div>
                  {activity.amount && (
                    <span className={`font-medium ${activity.type === 'payout' ? 'text-gray-900' : 'text-green-600'}`}>
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
