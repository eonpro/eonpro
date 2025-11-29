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
      const token = localStorage.getItem('token');
      const res = await fetch('/api/pharmacy/analytics', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
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
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i: any) => (
              <div key={i} className="bg-white rounded-lg shadow p-6">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Pharmacy Analytics</h1>
        <Link
          href="/pharmacy/prescriptions"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          View All Prescriptions
        </Link>
      </div>

      {!analytics ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800">No prescription data available yet.</p>
          <p className="text-sm text-yellow-700 mt-2">
            Data will appear here once prescriptions are processed through the system.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Total Orders</h3>
            <p className="text-3xl font-bold">{analytics.totalOrders}</p>
            <div className="mt-2 text-sm">
              <span className="text-green-600">{analytics.completedOrders} completed</span>
              {' • '}
              <span className="text-yellow-600">{analytics.pendingOrders} pending</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Processing Time</h3>
            <p className="text-3xl font-bold">{formatTime(analytics.avgTimeToProcess)}</p>
            <p className="text-xs text-gray-500 mt-2">Average time to process</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Shipping Time</h3>
            <p className="text-3xl font-bold">{formatTime(analytics.avgTimeToShip)}</p>
            <p className="text-xs text-gray-500 mt-2">Average time to ship</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">On-Time Delivery</h3>
            <p className="text-3xl font-bold">
              {analytics.onTimeDeliveryRate?.toFixed(1) || '0'}%
            </p>
            <p className="text-xs text-gray-500 mt-2">Met estimated delivery</p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-2">Webhook Integration Status</h2>
        <p className="text-sm text-gray-700 mb-4">
          The system is ready to receive prescription status updates from Lifefile.
        </p>
        <div className="bg-white rounded p-4 font-mono text-xs">
          <p className="font-semibold mb-2">Webhook Endpoint:</p>
          <code className="block bg-gray-100 p-2 rounded">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/lifefile/prescription-status
          </code>
        </div>
      </div>
    </div>
  );
}
