'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Users, Calendar, TrendingUp, Activity, Clock, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface AnalyticsData {
  totalPatients: number;
  appointmentsToday: number;
  activeProviders: number;
  pendingOrders: number;
}

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');
      const response = await apiFetch('/api/admin/dashboard', {
        credentials: 'include',
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });

      if (response.ok) {
        const result = await response.json();
        setData({
          totalPatients: result.stats?.totalPatients || 0,
          appointmentsToday: result.stats?.pendingOrders || 0, // Using pending orders as proxy
          activeProviders: result.stats?.activeProviders || 0,
          pendingOrders: result.stats?.pendingOrders || 0,
        });
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const metrics = [
    {
      label: 'Total Patients',
      value: data?.totalPatients?.toLocaleString() || '0',
      change: '-',
      icon: Users,
    },
    {
      label: 'Pending Orders',
      value: data?.pendingOrders?.toString() || '0',
      change: '-',
      icon: Calendar,
    },
    {
      label: 'Active Providers',
      value: data?.activeProviders?.toString() || '0',
      change: '-',
      icon: Activity,
    },
    { label: 'Platform Status', value: 'Active', change: 'Online', icon: TrendingUp },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-gray-600">Monitor clinic performance and metrics</p>
      </div>

      {/* Key Metrics */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const isPositive = metric.change.startsWith('+') || metric.change === 'Online';
          return (
            <div key={index} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-lg bg-[var(--brand-primary-light)] p-2">
                  <Icon className="h-6 w-6 text-[var(--brand-primary)]" />
                </div>
                <span
                  className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-gray-500'}`}
                >
                  {metric.change}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">{metric.value}</h3>
              <p className="mt-1 text-sm text-gray-600">{metric.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Quick Stats */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Quick Overview</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <div>
                <h3 className="font-medium text-gray-900">Total Patients</h3>
                <p className="text-sm text-gray-600">All registered patients</p>
              </div>
              <span className="text-lg font-semibold text-emerald-600">
                {data?.totalPatients?.toLocaleString() || '0'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <div>
                <h3 className="font-medium text-gray-900">Active Providers</h3>
                <p className="text-sm text-gray-600">Healthcare providers</p>
              </div>
              <span className="text-lg font-semibold text-emerald-600">
                {data?.activeProviders || '0'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <div>
                <h3 className="font-medium text-gray-900">Pending Orders</h3>
                <p className="text-sm text-gray-600">Orders awaiting processing</p>
              </div>
              <span className="text-lg font-semibold text-orange-600">
                {data?.pendingOrders || '0'}
              </span>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Analytics Dashboard</h2>
          <div className="flex h-64 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand-primary-light)] to-[var(--brand-primary-light)]">
            <div className="text-center">
              <BarChart3 className="mx-auto mb-2 h-12 w-12 text-[var(--brand-primary)]" />
              <p className="font-medium text-gray-700">Real-Time Data</p>
              <p className="mt-1 text-sm text-gray-500">
                All metrics shown are live from your database
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
