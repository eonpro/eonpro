'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface DashboardData {
  user: {
    email: string;
    role: string;
    permissions: number;
    features: number;
  };
  systemHealth: {
    status: string;
    checks: Record<string, string>;
  };
  integrationStatuses: Record<string, string>;
  stats: {
    totalUsers: number;
    activeIntegrations: number;
    totalIntegrations: number;
    webhooks: number;
  };
  quickActions: Array<{
    id: string;
    title: string;
    icon: string;
    path: string;
  }>;
}

export default function SettingsDashboard() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const token =
        localStorage.getItem('auth-token') || localStorage.getItem('admin-token') || 'demo-token'; // Allow demo access

      // Temporarily disabled authentication redirect for demo
      // if (!token) {
      //   router.push('/auth/login');
      //   return;
      // }

      const response = await fetch('/api/settings/dashboard', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard');
      }

      const data = await response.json();
      setDashboard(data);
    } catch (err: any) {
      // @ts-ignore

      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        Error: {error}
      </div>
    );
  }

  if (!dashboard) return null;

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600';
      case 'degraded':
        return 'text-yellow-600';
      case 'unhealthy':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getHealthBg = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100';
      case 'degraded':
        return 'bg-yellow-100';
      case 'unhealthy':
        return 'bg-red-100';
      default:
        return 'bg-gray-100';
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings Dashboard</h1>
        <p className="mt-2 text-gray-600">Welcome back, {dashboard.user.email}</p>
      </div>

      {/* System Health */}
      <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold">System Health</h2>
        <div className="mb-4 flex items-center">
          <div className={`rounded-full px-4 py-2 ${getHealthBg(dashboard.systemHealth.status)}`}>
            <span className={`font-medium ${getHealthColor(dashboard.systemHealth.status)}`}>
              {dashboard.systemHealth.status.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Object.entries(dashboard.systemHealth.checks).map(([service, status]) => (
            <div key={service} className="flex items-center">
              <div
                className={`mr-2 h-3 w-3 rounded-full ${
                  status === 'healthy'
                    ? 'bg-green-500'
                    : status === 'degraded'
                      ? 'bg-yellow-500'
                      : status === 'unhealthy'
                        ? 'bg-red-500'
                        : 'bg-gray-300'
                }`}
              />
              <span className="text-sm capitalize">{service}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{dashboard.stats.totalUsers}</p>
            </div>
            <svg
              className="h-8 w-8 text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Integrations</p>
              <p className="text-2xl font-bold text-gray-900">
                {dashboard.stats.activeIntegrations}/{dashboard.stats.totalIntegrations}
              </p>
            </div>
            <svg
              className="h-8 w-8 text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
              />
            </svg>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Webhooks</p>
              <p className="text-2xl font-bold text-gray-900">{dashboard.stats.webhooks}</p>
            </div>
            <svg
              className="h-8 w-8 text-gray-700"
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
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Your Role</p>
              <p className="text-2xl font-bold capitalize text-gray-900">
                {dashboard.user.role.toLowerCase()}
              </p>
            </div>
            <svg
              className="h-8 w-8 text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {dashboard.quickActions.length > 0 && (
        <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {dashboard.quickActions.map((action: any) => (
              <button
                key={action.id}
                onClick={() => router.push(action.path)}
                className="flex flex-col items-center justify-center rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
              >
                <span className="mb-2 text-2xl">{action.icon}</span>
                <span className="text-sm text-gray-700">{action.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Integration Status */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold">Integration Status</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(dashboard.integrationStatuses).map(([service, status]) => (
            <div
              key={service}
              className="flex items-center justify-between rounded-lg bg-gray-50 p-4"
            >
              <div className="flex items-center">
                <div
                  className={`mr-3 h-3 w-3 rounded-full ${
                    status === 'connected'
                      ? 'bg-green-500'
                      : status === 'degraded'
                        ? 'bg-yellow-500'
                        : 'bg-gray-300'
                  }`}
                />
                <span className="font-medium capitalize">{service}</span>
              </div>
              <span
                className={`text-sm ${
                  status === 'connected'
                    ? 'text-green-600'
                    : status === 'degraded'
                      ? 'text-yellow-600'
                      : 'text-gray-500'
                }`}
              >
                {status === 'connected'
                  ? 'Connected'
                  : status === 'degraded'
                    ? 'Degraded'
                    : 'Not Configured'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
