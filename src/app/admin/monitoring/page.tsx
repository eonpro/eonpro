'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/fetch';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  message?: string;
  details?: any;
}

interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  checks: HealthCheck[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

interface SystemMetric {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'stable';
}

interface FeatureFlagItem {
  flag: string;
  enabled: boolean;
  description: string;
  category: string;
  impactLevel: 'low' | 'medium' | 'high';
}

interface FeatureFlagResponse {
  flags: FeatureFlagItem[];
  totalFlags: number;
  disabledCount: number;
}

export default function MonitoringDashboard() {
  const router = useRouter();
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [metrics, setMetrics] = useState<SystemMetric[]>([]);
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagItem[]>([]);
  const [disabledFlagCount, setDisabledFlagCount] = useState(0);

  // Control Center is super_admin only
  useEffect(() => {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        router.replace('/login');
        return;
      }
      const parsed = JSON.parse(user);
      const role = parsed?.role?.toLowerCase();
      if (role !== 'super_admin') {
        router.replace('/admin');
        return;
      }
      setAccessAllowed(true);
    } catch {
      router.replace('/login');
    }
  }, [router]);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/health?full=true');

      if (response.ok) {
        const data = await response.json();
        setHealthReport(data);
        setError(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to fetch health status');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/dashboard');

      if (response.ok) {
        const data = await response.json();
        setMetrics([
          {
            label: 'Total Patients',
            value: data.stats?.totalPatients || 0,
            change: `${data.stats?.patientsChange || 0}%`,
            trend: (data.stats?.patientsChange || 0) >= 0 ? 'up' : 'down',
          },
          {
            label: 'Active Providers',
            value: data.stats?.activeProviders || 0,
            change: `${data.stats?.providersChange || 0}%`,
            trend: (data.stats?.providersChange || 0) >= 0 ? 'up' : 'down',
          },
          {
            label: 'Pending Orders',
            value: data.stats?.pendingOrders || 0,
            change: `${data.stats?.ordersChange || 0}%`,
            trend: 'stable',
          },
          {
            label: 'Monthly Revenue',
            value: `$${(data.stats?.totalRevenue || 0).toLocaleString()}`,
            change: `${data.stats?.revenueChange || 0}%`,
            trend: (data.stats?.revenueChange || 0) >= 0 ? 'up' : 'down',
          },
        ]);
      }
    } catch (err) {
      console.error('Failed to fetch metrics', err);
    }
  }, []);

  const fetchFeatureFlags = useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/feature-flags');
      if (response.ok) {
        const data: FeatureFlagResponse = await response.json();
        setFeatureFlags(data.flags || []);
        setDisabledFlagCount(data.disabledCount || 0);
      }
    } catch {
      // Feature flags API may not be available yet
    }
  }, []);

  useEffect(() => {
    if (accessAllowed !== true) return;
    fetchHealth();
    fetchMetrics();
    fetchFeatureFlags();
  }, [accessAllowed, fetchHealth, fetchMetrics, fetchFeatureFlags]);

  useEffect(() => {
    if (accessAllowed !== true || !autoRefresh) return;

    const interval = setInterval(() => {
      fetchHealth();
      fetchMetrics();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [accessAllowed, autoRefresh, fetchHealth, fetchMetrics]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-500';
      case 'degraded':
        return 'bg-amber-500';
      case 'unhealthy':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-50 border-emerald-200';
      case 'degraded':
        return 'bg-amber-50 border-amber-200';
      case 'unhealthy':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <svg
            className="h-5 w-5 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'degraded':
        return (
          <svg
            className="h-5 w-5 text-amber-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        );
      case 'unhealthy':
        return (
          <svg
            className="h-5 w-5 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="h-5 w-5 animate-spin text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        );
    }
  };

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up':
        return (
          <svg
            className="h-4 w-4 text-emerald-500"
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
        );
      case 'down':
        return (
          <svg
            className="h-4 w-4 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
          </svg>
        );
    }
  };

  // Super_admin only: show loading until access is confirmed or redirect completes
  if (accessAllowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-gray-100">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Control Center</h1>
            <p className="mt-1 text-gray-400">Platform health and all functions</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-600 bg-gray-700 text-emerald-500 focus:ring-emerald-500"
              />
              Auto-refresh (30s)
            </label>
            <button
              onClick={() => {
                fetchHealth();
                fetchMetrics();
              }}
              disabled={loading}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium transition hover:bg-gray-600 disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh Now'}
            </button>
          </div>
        </div>

        {/* Overall Status Banner */}
        {healthReport && (
          <div className={`mb-8 rounded-xl p-6 ${getStatusBgColor(healthReport.status)} border`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`h-16 w-16 rounded-full ${getStatusColor(healthReport.status)} flex items-center justify-center`}
                >
                  {getStatusIcon(healthReport.status)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold capitalize text-gray-900">
                    System {healthReport.status}
                  </h2>
                  <p className="text-gray-600">
                    {healthReport.summary.healthy}/{healthReport.summary.total} services operational
                  </p>
                </div>
              </div>
              <div className="text-right text-gray-600">
                <p className="text-sm">Last checked</p>
                <p className="font-medium">{lastRefresh?.toLocaleTimeString()}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-8 rounded-lg border border-red-700 bg-red-900/50 p-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <div key={index} className="rounded-xl border border-gray-700 bg-gray-800 p-5">
              <p className="mb-1 text-sm text-gray-400">{metric.label}</p>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-white">{metric.value}</span>
                <div className="flex items-center gap-1">
                  {getTrendIcon(metric.trend)}
                  <span
                    className={`text-sm ${
                      metric.trend === 'up'
                        ? 'text-emerald-400'
                        : metric.trend === 'down'
                          ? 'text-red-400'
                          : 'text-gray-400'
                    }`}
                  >
                    {metric.change}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Services Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {healthReport?.checks.map((check, index) => (
            <div
              key={index}
              className={`rounded-xl border bg-gray-800 p-5 ${
                check.status === 'healthy'
                  ? 'border-gray-700'
                  : check.status === 'degraded'
                    ? 'border-amber-700'
                    : 'border-red-700'
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${getStatusColor(check.status)}`} />
                  <h3 className="font-semibold text-white">{check.name}</h3>
                </div>
                {check.responseTime && (
                  <span className="text-xs text-gray-500">{check.responseTime}ms</span>
                )}
              </div>
              <p className="text-sm text-gray-400">{check.message}</p>
              {check.details && (
                <div className="mt-3 border-t border-gray-700 pt-3">
                  <pre className="overflow-auto text-xs text-gray-500">
                    {JSON.stringify(check.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Feature Flags Status */}
        {featureFlags.length > 0 && (
          <div className="mb-8 rounded-xl border border-gray-700 bg-gray-800 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Feature Flags</h3>
              <div className="flex items-center gap-3">
                {disabledFlagCount > 0 && (
                  <span className="rounded-full bg-red-900/50 px-3 py-1 text-xs text-red-400">
                    {disabledFlagCount} disabled
                  </span>
                )}
                <a
                  href="/admin/feature-flags"
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Manage Flags
                </a>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
              {featureFlags.map((flag) => (
                <div
                  key={flag.flag}
                  className={`rounded-lg p-3 ${
                    flag.enabled
                      ? 'bg-gray-700/50 border border-gray-600'
                      : 'bg-red-900/30 border border-red-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        flag.enabled ? 'bg-emerald-400' : 'bg-red-400'
                      }`}
                    />
                    <span className="text-xs text-gray-300 truncate">{flag.flag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-3 text-sm transition hover:bg-gray-600"
            >
              <svg
                className="h-5 w-5 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Quick Health Check
            </a>
            <a
              href="/api/health?full=true"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-3 text-sm transition hover:bg-gray-600"
            >
              <svg
                className="h-5 w-5 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              Full System Report
            </a>
            <a
              href="/admin/settings"
              className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-3 text-sm transition hover:bg-gray-600"
            >
              <svg
                className="h-5 w-5 text-[var(--brand-primary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              System Settings
            </a>
            <a
              href="/admin/feature-flags"
              className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-3 text-sm transition hover:bg-gray-600"
            >
              <svg
                className="h-5 w-5 text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                />
              </svg>
              Feature Flags
            </a>
          </div>
        </div>

        {/* Environment Info */}
        {healthReport && (
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>
              Environment: <span className="text-gray-400">{healthReport.environment}</span> |
              Version: <span className="text-gray-400">{healthReport.version}</span> | Uptime:{' '}
              <span className="text-gray-400">{healthReport.uptime}s</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
