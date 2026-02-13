'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import Link from 'next/link';

interface Analytics {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  avgTimeToProcess: number;
  avgTimeToShip: number;
  avgTimeToDeliver: number;
  onTimeDeliveryRate: number;
}

export default function PharmacyAnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');
      const res = await fetch('/api/pharmacy/analytics', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('Failed to fetch analytics', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes?: number): string => {
    if (!minutes) return '-';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="mb-6 h-8 w-1/3 rounded bg-gray-200"></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i: any) => (
              <div key={i} className="rounded-lg bg-white p-6 shadow">
                <div className="mb-2 h-4 w-1/2 rounded bg-gray-200"></div>
                <div className="h-8 w-3/4 rounded bg-gray-200"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Pharmacy Analytics</h1>
        <Link
          href="/pharmacy/prescriptions"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          View All Prescriptions
        </Link>
      </div>

      {!analytics ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
          <p className="text-yellow-800">No prescription data available yet.</p>
          <p className="mt-2 text-sm text-yellow-700">
            Data will appear here once prescriptions are processed through the system.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-2 text-sm font-medium text-gray-600">Total Orders</h3>
            <p className="text-3xl font-bold">{analytics.totalOrders}</p>
            <div className="mt-2 text-sm">
              <span className="text-green-600">{analytics.completedOrders} completed</span>
              {' • '}
              <span className="text-yellow-600">{analytics.pendingOrders} pending</span>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-2 text-sm font-medium text-gray-600">Processing Time</h3>
            <p className="text-3xl font-bold">{formatTime(analytics.avgTimeToProcess)}</p>
            <p className="mt-2 text-xs text-gray-500">Average time to process</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-2 text-sm font-medium text-gray-600">Shipping Time</h3>
            <p className="text-3xl font-bold">{formatTime(analytics.avgTimeToShip)}</p>
            <p className="mt-2 text-xs text-gray-500">Average time to ship</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-2 text-sm font-medium text-gray-600">On-Time Delivery</h3>
            <p className="text-3xl font-bold">{analytics.onTimeDeliveryRate?.toFixed(1) || '0'}%</p>
            <p className="mt-2 text-xs text-gray-500">Met estimated delivery</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <h2 className="mb-2 text-lg font-semibold">Webhook Integration Status</h2>
        <p className="mb-4 text-sm text-gray-700">
          The system is ready to receive prescription status updates from Lifefile.
        </p>
        <div className="rounded bg-white p-4 font-mono text-xs">
          <p className="mb-2 font-semibold">Webhook Endpoint:</p>
          <code className="block rounded bg-gray-100 p-2">
            {typeof window !== 'undefined' ? window.location.origin : ''}
            /api/webhooks/lifefile/prescription-status
          </code>
        </div>
      </div>
    </div>
  );
}
