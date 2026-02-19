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

    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, isActive: false } : d))
    );

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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/patient-portal/settings"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Connected Devices
          </h1>
        </div>
        <p className="text-gray-500 ml-7">
          Sync health data from your wearable devices automatically
        </p>
      </div>

      {/* What gets synced */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
        <h2 className="text-sm font-semibold text-indigo-900 mb-3 uppercase tracking-wide">
          What gets synced
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {DATA_TYPES.map((dt) => (
            <div
              key={dt.label}
              className="flex flex-col items-center text-center p-3 bg-white/60 rounded-xl"
            >
              <dt.icon className="w-6 h-6 text-indigo-600 mb-1.5" />
              <span className="text-sm font-medium text-gray-900">
                {dt.label}
              </span>
              <span className="text-xs text-gray-500 mt-0.5">{dt.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3">
          <XCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={loadDevices}
            className="ml-auto text-sm underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {activeDevices.length === 0 && !error && (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
              <Watch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-700 mb-1">
                No devices connected
              </h3>
              <p className="text-gray-500 text-sm mb-5 max-w-sm mx-auto">
                Connect your Fitbit, Garmin, Oura Ring, Withings, or other
                wearable to automatically sync your health data.
              </p>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {connecting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
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
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-2xl">
                    {PROVIDER_ICONS[device.provider] || '⌚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">
                        {device.providerLabel}
                      </h3>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <Wifi className="w-3 h-3" />
                        Connected
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Last synced: {formatLastSync(device.lastSyncAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDisconnect(device.id)}
                    disabled={disconnectingId === device.id}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {disconnectingId === device.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Disconnect
                  </button>
                </div>
              ))}

              {/* Add another device */}
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full bg-white rounded-xl border-2 border-dashed border-gray-200 p-4 flex items-center justify-center gap-2 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50"
              >
                {connecting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
                {connecting ? 'Connecting...' : 'Connect Another Device'}
              </button>
            </div>
          )}

          {/* Previously connected (inactive) */}
          {inactiveDevices.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-gray-500 mb-3">
                Previously Connected
              </h3>
              <div className="space-y-2">
                {inactiveDevices.map((device) => (
                  <div
                    key={device.id}
                    className="bg-gray-50 rounded-xl border border-gray-100 p-3 flex items-center gap-3 opacity-60"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
                      {PROVIDER_ICONS[device.provider] || '⌚'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-700 text-sm">
                        {device.providerLabel}
                      </h4>
                      <p className="text-xs text-gray-400">
                        Disconnected · Last synced{' '}
                        {formatLastSync(device.lastSyncAt)}
                      </p>
                    </div>
                    <WifiOff className="w-4 h-4 text-gray-400" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Supported devices info */}
      <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
          Supported Devices
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
            <div
              key={name}
              className="flex items-center gap-2 text-sm text-gray-600 py-1.5"
            >
              <CheckCircle2
                className="w-4 h-4 flex-shrink-0"
                style={{ color: primaryColor }}
              />
              {name}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Apple Health requires our companion iOS app (coming soon). All
          other devices connect instantly via the web.
        </p>
      </div>
    </div>
  );
}
