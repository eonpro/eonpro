'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/fetch';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  TrendingUp,
  Shield,
} from 'lucide-react';

interface ProbeResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message?: string;
}

interface EndpointMetrics {
  endpoint: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
}

interface IncidentRecord {
  from: string;
  to: string;
  timestamp: string;
  probes: ProbeResult[];
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  durationMs: number;
  uptimeMs: number;
  probes: ProbeResult[];
  metrics?: {
    windowMs: number;
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    endpoints: EndpointMetrics[];
  };
  incidents?: IncidentRecord[];
  lastKnownStatus?: string;
}

const STATUS_CONFIG = {
  healthy: { label: 'Healthy', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2, dot: 'bg-emerald-500' },
  degraded: { label: 'Degraded', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle, dot: 'bg-amber-500' },
  unhealthy: { label: 'Unhealthy', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle, dot: 'bg-red-500' },
};

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function PortalHealthDashboard() {
  const router = useRouter();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiFetch('/api/patient-portal/health?full=true');
      if (res.status === 401) {
        router.push('/login?reason=unauthorized');
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading portal health...</span>
        </div>
      </div>
    );
  }

  const status = data?.status || 'unhealthy';
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Patient Portal Health</h1>
            <p className="text-sm text-gray-500">
              Real-time monitoring of patient-facing services
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh (30s)
            </label>
            <button
              onClick={fetchHealth}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Status Banner */}
        <div className={`rounded-2xl border ${config.border} ${config.bg} p-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${config.bg}`}>
                <StatusIcon className={`h-6 w-6 ${config.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${config.dot} animate-pulse`} />
                  <h2 className={`text-xl font-bold ${config.color}`}>{config.label}</h2>
                </div>
                <p className="text-sm text-gray-600">
                  Last checked: {lastRefresh ? formatTime(lastRefresh.toISOString()) : '—'}
                  {data?.durationMs != null && ` (${data.durationMs}ms)`}
                </p>
              </div>
            </div>
            {data?.uptimeMs != null && (
              <div className="text-right">
                <p className="text-sm text-gray-500">Instance Uptime</p>
                <p className="text-lg font-semibold text-gray-900">{formatUptime(data.uptimeMs)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Probes Grid */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Shield className="h-5 w-5 text-gray-400" />
            Health Probes
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.probes.map((probe) => {
              const pc = STATUS_CONFIG[probe.status];
              const PIcon = pc.icon;
              return (
                <div key={probe.name} className={`rounded-xl border ${pc.border} ${pc.bg} p-4`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PIcon className={`h-4 w-4 ${pc.color}`} />
                      <span className="font-medium text-gray-900">{probe.name}</span>
                    </div>
                    <span className={`text-xs font-semibold ${pc.color}`}>{probe.status}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-600">{probe.message || '—'}</span>
                    <span className="font-mono text-gray-500">{probe.latencyMs}ms</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Metrics */}
        {data?.metrics && data.metrics.totalRequests > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <TrendingUp className="h-5 w-5 text-gray-400" />
              Request Metrics (Last Hour)
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricCard label="Total Requests" value={data.metrics.totalRequests.toString()} />
              <MetricCard label="Total Errors" value={data.metrics.totalErrors.toString()} alert={data.metrics.totalErrors > 0} />
              <MetricCard label="Error Rate" value={`${(data.metrics.errorRate * 100).toFixed(1)}%`} alert={data.metrics.errorRate > 0.05} />
              <MetricCard label="Endpoints Tracked" value={data.metrics.endpoints.length.toString()} />
            </div>

            {data.metrics.endpoints.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Endpoint</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Requests</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Errors</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">p50</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">p95</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">p99</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.metrics.endpoints.map((ep) => (
                      <tr key={ep.endpoint} className="border-b border-gray-50">
                        <td className="px-4 py-2 font-mono text-gray-900">{ep.endpoint}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{ep.requestCount}</td>
                        <td className={`px-4 py-2 text-right ${ep.errorCount > 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                          {ep.errorCount}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-gray-600">{ep.p50}ms</td>
                        <td className={`px-4 py-2 text-right font-mono ${ep.p95 > 1000 ? 'text-amber-600' : 'text-gray-600'}`}>
                          {ep.p95}ms
                        </td>
                        <td className={`px-4 py-2 text-right font-mono ${ep.p99 > 2000 ? 'text-red-600' : 'text-gray-600'}`}>
                          {ep.p99}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Incidents */}
        {data?.incidents && data.incidents.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Clock className="h-5 w-5 text-gray-400" />
              Recent Incidents
            </h3>
            <div className="space-y-2">
              {data.incidents.map((inc, i) => {
                const toConfig = STATUS_CONFIG[inc.to as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.unhealthy;
                const isRecovery = inc.to === 'healthy';
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg border p-3 ${isRecovery ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Activity className={`h-4 w-4 ${toConfig.color}`} />
                      <span className="text-sm text-gray-900">
                        <span className="font-medium">{inc.from}</span>
                        {' → '}
                        <span className={`font-semibold ${toConfig.color}`}>{inc.to}</span>
                      </span>
                      <span className="text-xs text-gray-500">
                        {inc.probes
                          .filter((p) => p.status !== 'healthy')
                          .map((p) => p.name)
                          .join(', ') || 'All probes recovered'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">{formatTime(inc.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
