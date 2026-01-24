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
    paid: 'bg-blue-50 text-blue-700',
    reversed: 'bg-red-50 text-red-700',
    processing: 'bg-yellow-50 text-yellow-700',
    completed: 'bg-green-50 text-green-700',
    failed: 'bg-red-50 text-red-700',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[status] || 'bg-gray-50 text-gray-700'}`}>
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

  // Mock data for development
  const displayData: EarningsData = data || {
    summary: {
      availableBalance: 125000,
      pendingBalance: 45000,
      processingPayout: 0,
      lifetimeEarnings: 850000,
      lifetimePaid: 680000,
    },
    commissions: [
      { id: '1', createdAt: new Date().toISOString(), amount: 2500, status: 'approved', orderAmount: 12500, refCode: 'SUMMER24' },
      { id: '2', createdAt: new Date(Date.now() - 86400000).toISOString(), amount: 1800, status: 'pending', orderAmount: 9000, refCode: 'SUMMER24', holdUntil: new Date(Date.now() + 86400000 * 14).toISOString() },
      { id: '3', createdAt: new Date(Date.now() - 172800000).toISOString(), amount: 3200, status: 'paid', orderAmount: 16000, refCode: 'VIP10' },
      { id: '4', createdAt: new Date(Date.now() - 259200000).toISOString(), amount: 2100, status: 'approved', orderAmount: 10500, refCode: 'SUMMER24' },
      { id: '5', createdAt: new Date(Date.now() - 345600000).toISOString(), amount: 1500, status: 'reversed', orderAmount: 7500, refCode: 'SUMMER24' },
    ],
    payouts: [
      { id: '1', createdAt: new Date(Date.now() - 604800000).toISOString(), amount: 50000, fee: 0, netAmount: 50000, status: 'completed', method: 'Bank Transfer' },
      { id: '2', createdAt: new Date(Date.now() - 2592000000).toISOString(), amount: 75000, fee: 0, netAmount: 75000, status: 'completed', method: 'Bank Transfer' },
    ],
    nextPayout: {
      date: new Date(Date.now() + 604800000).toISOString(),
      estimatedAmount: 45000,
    },
  };

  const filteredCommissions = displayData.commissions.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">Earnings</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Balance Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6"
        >
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-gray-500 text-sm mb-1">Available</p>
              <p className="text-3xl font-semibold text-gray-900">
                {formatCurrency(displayData.summary.availableBalance)}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm mb-1">Pending</p>
              <p className="text-3xl font-semibold text-yellow-600">
                {formatCurrency(displayData.summary.pendingBalance)}
              </p>
            </div>
          </div>

          {displayData.summary.availableBalance >= 5000 && (
            <Link
              href="/affiliate/withdraw"
              className="mt-6 block w-full py-3 bg-gray-900 text-white font-medium rounded-xl text-center
                       hover:bg-gray-800 transition-colors"
            >
              Withdraw Funds
            </Link>
          )}

          {displayData.nextPayout && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Next scheduled payout</span>
                <span className="font-medium text-gray-900">{formatDate(displayData.nextPayout.date)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Estimated: {formatCurrency(displayData.nextPayout.estimatedAmount)}
              </p>
            </div>
          )}
        </motion.div>

        {/* Lifetime Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-5">
            <p className="text-gray-500 text-sm mb-1">Lifetime Earned</p>
            <p className="text-xl font-semibold text-gray-900">
              {formatCurrency(displayData.summary.lifetimeEarnings)}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5">
            <p className="text-gray-500 text-sm mb-1">Total Paid Out</p>
            <p className="text-xl font-semibold text-gray-900">
              {formatCurrency(displayData.summary.lifetimePaid)}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl overflow-hidden">
          <div className="flex border-b border-gray-100">
            {(['commissions', 'payouts'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-4 text-sm font-medium transition-colors relative
                  ${activeTab === tab ? 'text-gray-900' : 'text-gray-400'}`}
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
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex gap-2 overflow-x-auto">
                    {(['all', 'pending', 'approved', 'paid'] as FilterType[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors
                          ${filter === f 
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
                        <div className="flex items-start justify-between mb-2">
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
                          <p className="text-xs text-yellow-600 mt-2">
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
                      <div className="flex items-start justify-between mb-2">
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
                        {payout.fee > 0 && (
                          <span>Fee: {formatCurrency(payout.fee)}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 rounded-2xl p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm">
              <p className="font-medium text-blue-900 mb-1">How commissions work</p>
              <p className="text-blue-700">
                Commissions are held for 14 days to account for refunds, then automatically 
                become available for withdrawal. Payouts are processed weekly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
