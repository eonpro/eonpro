'use client';

/**
 * Affiliate Activity Page
 * 
 * Full activity history and transaction log.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, ArrowUpRight, Clock } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'conversion' | 'payout' | 'click';
  amount?: number;
  createdAt: string;
  description: string;
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

export default function AffiliateActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const res = await fetch('/api/affiliate/dashboard');
        if (res.ok) {
          const data = await res.json();
          setActivities(data.recentActivity || []);
        }
      } catch (error) {
        console.error('Failed to fetch activity:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchActivity();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-100">
        <div className="max-w-3xl mx-auto">
          <Link 
            href="/affiliate" 
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Activity</h1>
          <p className="text-gray-500 mt-1">Your recent conversions and payouts</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {activities.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-8 text-center"
          >
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No Activity Yet
            </h2>
            <p className="text-gray-500 max-w-sm mx-auto">
              Once you start generating clicks and conversions, your activity will appear here.
            </p>
            <Link
              href="/affiliate/links"
              className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
            >
              Get Your Links
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl overflow-hidden"
          >
            <div className="divide-y divide-gray-100">
              {activities.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center
                      ${activity.type === 'conversion' ? 'bg-green-50' : 
                        activity.type === 'payout' ? 'bg-[#fdf6e3]' : 'bg-gray-50'}`}>
                      {activity.type === 'conversion' && (
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      )}
                      {activity.type === 'payout' && (
                        <ArrowUpRight className="w-5 h-5 text-[#cab172]" />
                      )}
                      {activity.type === 'click' && (
                        <Clock className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{activity.description}</p>
                      <p className="text-sm text-gray-500">{formatRelativeTime(activity.createdAt)}</p>
                    </div>
                  </div>
                  {activity.amount && (
                    <span className={`font-semibold ${
                      activity.type === 'payout' ? 'text-gray-900' : 'text-green-600'
                    }`}>
                      {activity.type === 'payout' ? '-' : '+'}
                      {formatCurrency(activity.amount)}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
