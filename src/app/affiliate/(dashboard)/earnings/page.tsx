'use client';

/**
 * Affiliate Earnings Page
 *
 * Detailed earnings view with transaction history,
 * filterable by date range and status.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface Commission {
  id: string;
  createdAt: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'reversed';
  orderAmount: number;
  refCode: string;
  holdUntil?: string;
}

interface Payout {
  id: string;
  createdAt: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: 'processing' | 'completed' | 'failed';
  method: string;
}

interface EarningsData {
  summary: {
    availableBalance: number;
    pendingBalance: number;
    processingPayout: number;
    lifetimeEarnings: number;
    lifetimePaid: number;
  };
  commissions: Commission[];
  payouts: Payout[];
  nextPayout?: {
    date: string;
    estimatedAmount: number;
  };
}

type TabType = 'commissions' | 'payouts';
type FilterType = 'all' | 'pending' | 'approved' | 'paid';

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700',
    approved: 'bg-green-50 text-green-700',
    paid: 'bg-[#fdf6e3] text-[#8b7a42]',
    reversed: 'bg-red-50 text-red-700',
    processing: 'bg-yellow-50 text-yellow-700',
    completed: 'bg-green-50 text-green-700',
    failed: 'bg-red-50 text-red-700',
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || 'bg-gray-50 text-gray-700'}`}
    >
      {status}
    </span>
  );
};

export default function EarningsPage() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('commissions');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchEarnings = async () => {
      try {
        const res = await fetch('/api/affiliate/earnings');
        if (res.ok) {
          const earningsData = await res.json();
          setData(earningsData);
        }
      } catch (error) {
        console.error('Failed to fetch earnings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEarnings();
  }, []);

  // Use real data or empty state
  const displayData: EarningsData = data || {
    summary: {
      availableBalance: 0,
      pendingBalance: 0,
      processingPayout: 0,
      lifetimeEarnings: 0,
      lifetimePaid: 0,
    },
    commissions: [],
    payouts: [],
  };

  const filteredCommissions = displayData.commissions.filter((c) => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-semibold text-gray-900">Earnings</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
        {/* Balance Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white p-6"
        >
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="mb-1 text-sm text-gray-500">Available</p>
              <p className="text-3xl font-semibold text-gray-900">
                {formatCurrency(displayData.summary.availableBalance)}
              </p>
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-500">Pending</p>
              <p className="text-3xl font-semibold text-yellow-600">
                {formatCurrency(displayData.summary.pendingBalance)}
              </p>
            </div>
          </div>

          {displayData.summary.availableBalance >= 5000 && (
            <Link
              href="/affiliate/withdraw"
              className="mt-6 block w-full rounded-xl bg-gray-900 py-3 text-center font-medium text-white transition-colors hover:bg-gray-800"
            >
              Withdraw Funds
            </Link>
          )}

          {displayData.nextPayout && (
            <div className="mt-4 rounded-xl bg-gray-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Next scheduled payout</span>
                <span className="font-medium text-gray-900">
                  {formatDate(displayData.nextPayout.date)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Estimated: {formatCurrency(displayData.nextPayout.estimatedAmount)}
              </p>
            </div>
          )}
        </motion.div>

        {/* Lifetime Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white p-5">
            <p className="mb-1 text-sm text-gray-500">Lifetime Earned</p>
            <p className="text-xl font-semibold text-gray-900">
              {formatCurrency(displayData.summary.lifetimeEarnings)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5">
            <p className="mb-1 text-sm text-gray-500">Total Paid Out</p>
            <p className="text-xl font-semibold text-gray-900">
              {formatCurrency(displayData.summary.lifetimePaid)}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-hidden rounded-2xl bg-white">
          <div className="flex border-b border-gray-100">
            {(['commissions', 'payouts'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative flex-1 py-4 text-sm font-medium transition-colors ${activeTab === tab ? 'text-gray-900' : 'text-gray-400'}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {activeTab === tab && (
                  <motion.div
                    layoutId="earningsTabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Commissions Tab */}
          <AnimatePresence mode="wait">
            {activeTab === 'commissions' && (
              <motion.div
                key="commissions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Filters */}
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <div className="flex gap-2 overflow-x-auto">
                    {(['all', 'pending', 'approved', 'paid'] as FilterType[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
                          filter === f
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Commission List */}
                <div className="divide-y divide-gray-100">
                  {filteredCommissions.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-gray-400">No commissions found</p>
                    </div>
                  ) : (
                    filteredCommissions.map((commission) => (
                      <div key={commission.id} className="px-4 py-4">
                        <div className="mb-2 flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatCurrency(commission.amount)}
                            </p>
                            <p className="text-sm text-gray-500">
                              From {formatCurrency(commission.orderAmount)} order
                            </p>
                          </div>
                          <StatusBadge status={commission.status} />
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span>{formatDate(commission.createdAt)}</span>
                          <span>Code: {commission.refCode}</span>
                        </div>
                        {commission.status === 'pending' && commission.holdUntil && (
                          <p className="mt-2 text-xs text-yellow-600">
                            Available after {formatDate(commission.holdUntil)}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'payouts' && (
              <motion.div
                key="payouts"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="divide-y divide-gray-100"
              >
                {displayData.payouts.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-gray-400">No payouts yet</p>
                  </div>
                ) : (
                  displayData.payouts.map((payout) => (
                    <div key={payout.id} className="px-4 py-4">
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {formatCurrency(payout.netAmount)}
                          </p>
                          <p className="text-sm text-gray-500">{payout.method}</p>
                        </div>
                        <StatusBadge status={payout.status} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{formatDate(payout.createdAt)}</span>
                        {payout.fee > 0 && <span>Fee: {formatCurrency(payout.fee)}</span>}
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Info Card */}
        <div className="rounded-2xl bg-[#fdf6e3] p-4">
          <div className="flex gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#cab172]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-sm">
              <p className="mb-1 font-medium text-[#6b5c2e]">How commissions work</p>
              <p className="text-[#8b7a42]">
                Commissions are held for 14 days to account for refunds, then automatically become
                available for withdrawal. Payouts are processed weekly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
