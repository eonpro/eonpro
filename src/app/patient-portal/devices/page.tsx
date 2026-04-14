'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { logger } from '@/lib/logger';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import {
  Watch,
  Smartphone,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
  Heart,
  Footprints,
  Moon,
  Scale,
  Apple,
  ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface DeviceConnection {
  id: number;
  provider: string;
  providerLabel: string;
  isActive: boolean;
  lastSyncAt: string | null;
  connectedAt: string;
}

const PROVIDER_ICONS: Record<string, string> = {
  FITBIT: '⌚',
  GARMIN: '⌚',
  OURA: '💍',
  WITHINGS: '⚖️',
  POLAR: '⌚',
  WHOOP: '💪',
  EIGHT: '🛏️',
  APPLE: '🍎',
  SAMSUNG: '📱',
  GOOGLE: '📱',
  COROS: '⌚',
  PELOTON: '🚴',
};

const DATA_TYPES = [
  { icon: Scale, label: 'Weight', desc: 'Body weight & composition' },
  { icon: Activity, label: 'Exercise', desc: 'Workouts, steps & distance' },
  { icon: Moon, label: 'Sleep', desc: 'Sleep duration & quality' },
  { icon: Heart, label: 'Heart Rate', desc: 'Resting & active heart rate' },
  { icon: Footprints, label: 'Steps', desc: 'Daily step count' },
];

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export default function DevicesPage() {
  const { t } = usePatientPortalLanguage();
  const { branding } = useClinicBranding();
  const searchParams = useSearchParams();
  const [devices, setDevices] = useState<DeviceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const primaryColor = branding?.primaryColor || '#4F46E5';

  const loadDevices = useCallback(async () => {
    try {
      setError(null);
      const res = await portalFetch('/api/patient-portal/devices');
      if (!res.ok) throw new Error('Failed to load devices');
      const data = await res.json();
      setDevices(data.devices || []);
    } catch (err) {
      logger.warn('Failed to load devices', { error: String(err) });
      setError('Unable to load connected devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Handle redirect back from Terra widget
  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected === 'true') {
      toast.success('Device connected successfully!');
      loadDevices();
    } else if (connected === 'false') {
      toast.error('Device connection was cancelled or failed');
    }
  }, [searchParams, loadDevices]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await portalFetch('/api/patient-portal/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start connection');
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No widget URL returned');
      }
    } catch (err) {
      logger.warn('Failed to connect device', { error: String(err) });
      toast.error(err instanceof Error ? err.message : 'Failed to connect device');
      setConnecting(false);
    }
  };

  const handleDisconnect = async (deviceId: number) => {
    setDisconnectingId(deviceId);
    const prevDevices = [...devices];

    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, isActive: false } : d)));

    try {
      const res = await portalFetch('/api/patient-portal/devices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });

      if (!res.ok) throw new Error('Failed to disconnect');
      toast.success('Device disconnected');
      await loadDevices();
    } catch (err) {
      logger.warn('Failed to disconnect device', { error: String(err) });
      toast.error('Failed to disconnect device');
      setDevices(prevDevices);
    } finally {
      setDisconnectingId(null);
    }
  };

  const activeDevices = devices.filter((d) => d.isActive);
  const inactiveDevices = devices.filter((d) => !d.isActive);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Link
            href="/patient-portal/settings"
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Connected Devices</h1>
        </div>
        <p className="ml-7 text-gray-500">
          Sync health data from your wearable devices automatically
        </p>
      </div>

      {/* What gets synced */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-900">
          What gets synced
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {DATA_TYPES.map((dt) => (
            <div
              key={dt.label}
              className="flex flex-col items-center rounded-xl bg-white/60 p-3 text-center"
            >
              <dt.icon className="mb-1.5 h-6 w-6 text-indigo-600" />
              <span className="text-sm font-medium text-gray-900">{dt.label}</span>
              <span className="mt-0.5 text-xs text-gray-500">{dt.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 p-4 text-red-700">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadDevices} className="ml-auto text-sm underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Connected devices */}
      {!loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Your Devices
              {activeDevices.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({activeDevices.length} connected)
                </span>
              )}
            </h2>
            <button
              onClick={loadDevices}
              className="text-gray-400 transition-colors hover:text-gray-600"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {activeDevices.length === 0 && !error && (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 py-12 text-center">
              <Watch className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <h3 className="mb-1 text-lg font-medium text-gray-700">No devices connected</h3>
              <p className="mx-auto mb-5 max-w-sm text-sm text-gray-500">
                Connect your Fitbit, Garmin, Oura Ring, Withings, or other wearable to automatically
                sync your health data.
              </p>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {connecting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
                {connecting ? 'Connecting...' : 'Connect Device'}
              </button>
            </div>
          )}

          {activeDevices.length > 0 && (
            <div className="space-y-3">
              {activeDevices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-2xl">
                    {PROVIDER_ICONS[device.provider] || '⌚'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{device.providerLabel}</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <Wifi className="h-3 w-3" />
                        Connected
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500">
                      Last synced: {formatLastSync(device.lastSyncAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDisconnect(device.id)}
                    disabled={disconnectingId === device.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    {disconnectingId === device.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Disconnect
                  </button>
                </div>
              ))}

              {/* Add another device */}
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-white p-4 text-gray-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
              >
                {connecting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
                {connecting ? 'Connecting...' : 'Connect Another Device'}
              </button>
            </div>
          )}

          {/* Previously connected (inactive) */}
          {inactiveDevices.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-medium text-gray-500">Previously Connected</h3>
              <div className="space-y-2">
                {inactiveDevices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 opacity-60"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-lg">
                      {PROVIDER_ICONS[device.provider] || '⌚'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-gray-700">{device.providerLabel}</h4>
                      <p className="text-xs text-gray-400">
                        Disconnected · Last synced {formatLastSync(device.lastSyncAt)}
                      </p>
                    </div>
                    <WifiOff className="h-4 w-4 text-gray-400" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Supported devices info */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
          Supported Devices
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {[
            'Fitbit',
            'Garmin',
            'Oura Ring',
            'Withings',
            'Polar',
            'WHOOP',
            'Eight Sleep',
            'COROS',
            'Suunto',
            'Peloton',
            'Cronometer',
            'MyFitnessPal',
          ].map((name) => (
            <div key={name} className="flex items-center gap-2 py-1.5 text-sm text-gray-600">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: primaryColor }} />
              {name}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-400">
          Apple Health requires our companion iOS app (coming soon). All other devices connect
          instantly via the web.
        </p>
      </div>
    </div>
  );
}
