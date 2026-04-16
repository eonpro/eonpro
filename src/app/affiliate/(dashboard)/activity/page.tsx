'use client';

/**
 * Affiliate Activity Page
 *
 * Full activity history with pagination, type filters, and error handling.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, ArrowUpRight, Clock, AlertCircle, Filter } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'conversion' | 'payout' | 'click';
  amount?: number;
  createdAt: string;
  description: string;
}

type ActivityFilter = 'all' | 'conversion' | 'payout' | 'click';

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function AffiliateActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);

  const fetchActivity = useCallback(
    async (pageNum: number, append = false) => {
      if (pageNum === 1) setIsLoading(true);
      else setLoadingMore(true);
      setLoadError(null);

      try {
        // Fetch from dashboard for initial data, then commissions for more detail
        const [dashboardRes, commissionsRes] = await Promise.all([
          pageNum === 1 ? apiFetch('/api/affiliate/dashboard') : null,
          apiFetch(`/api/affiliate/commissions?page=${pageNum}&limit=20`),
        ]);

        let combined: ActivityItem[] = [];

        if (dashboardRes?.ok) {
          const dashData = await dashboardRes.json();
          combined = dashData.recentActivity || [];
        }

        if (commissionsRes?.ok) {
          const commData = await commissionsRes.json();
          const commItems: ActivityItem[] = (commData.commissions || []).map(
            (c: any) => ({
              id: `comm-${c.id}`,
              type: 'conversion' as const,
              amount: c.commissionAmountCents,
              createdAt: c.occurredAt || c.createdAt,
              description: `Commission: ${c.metadata?.planName || 'Referral'} (${c.status?.toLowerCase()})`,
            })
          );

          if (append) {
            combined = commItems;
          } else {
            // Merge without duplicates
            const existingIds = new Set(combined.map((a) => a.id));
            for (const item of commItems) {
              if (!existingIds.has(item.id)) {
                combined.push(item);
              }
            }
          }

          setHasMore(
            commData.pagination
              ? commData.pagination.page < commData.pagination.totalPages
              : false
          );
        }

        combined.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        if (append) {
          setActivities((prev) => {
            const existingIds = new Set(prev.map((a) => a.id));
            const newItems = combined.filter((item) => !existingIds.has(item.id));
            return [...prev, ...newItems];
          });
        } else {
          setActivities(combined);
        }
      } catch {
        setLoadError('Failed to load activity. Please try again.');
      } finally {
        setIsLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchActivity(1);
  }, [fetchActivity]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchActivity(nextPage, true);
  };

  const filteredActivities =
    filter === 'all' ? activities : activities.filter((a) => a.type === filter);

  const filters: { value: ActivityFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'conversion', label: 'Conversions' },
    { value: 'payout', label: 'Payouts' },
    { value: 'click', label: 'Clicks' },
  ];

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  if (loadError && activities.length === 0) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-gray-100 bg-white px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/affiliate"
              className="mb-4 inline-flex items-center gap-2 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900">Activity</h1>
          </div>
        </header>
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-300" />
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Unable to load activity</h2>
          <p className="mb-6 text-sm text-gray-500">{loadError}</p>
          <button
            onClick={() => fetchActivity(1)}
            className="rounded-xl px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/affiliate"
            className="mb-4 inline-flex items-center gap-2 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Activity</h1>
          <p className="mt-1 text-gray-500">Your conversions, payouts, and clicks</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        {/* Filters */}
        <div className="mb-6 flex gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filteredActivities.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white p-8 text-center"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Clock className="h-8 w-8 text-gray-400" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900">No Activity Yet</h2>
            <p className="mx-auto max-w-sm text-gray-500">
              {filter === 'all'
                ? 'Once you start generating clicks and conversions, your activity will appear here.'
                : `No ${filter} activity found.`}
            </p>
            <Link
              href="/affiliate/links"
              className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Get Your Links
            </Link>
          </motion.div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-2xl bg-white"
            >
              <div className="divide-y divide-gray-100">
                {filteredActivities.map((activity, index) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.5) }}
                    className="flex items-center justify-between p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full ${
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
                          <TrendingUp className="h-5 w-5 text-green-600" />
                        )}
                        {activity.type === 'payout' && (
                          <ArrowUpRight
                            className="h-5 w-5"
                            style={{ color: 'var(--brand-accent)' }}
                          />
                        )}
                        {activity.type === 'click' && (
                          <Clock className="h-5 w-5 text-gray-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{activity.description}</p>
                        <p className="text-sm text-gray-500">
                          {formatRelativeTime(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                    {activity.amount && (
                      <span
                        className={`font-semibold ${
                          activity.type === 'payout' ? 'text-gray-900' : 'text-green-600'
                        }`}
                      >
                        {activity.type === 'payout' ? '-' : '+'}
                        {formatCurrency(activity.amount)}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Load More */}
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
