'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { safeParseJsonString } from '@/lib/utils/safe-json';

interface FeatureFlagItem {
  flag: string;
  enabled: boolean;
  description: string;
  category: string;
  impactLevel: 'low' | 'medium' | 'high';
}

interface FlagResponse {
  flags: FeatureFlagItem[];
  totalFlags: number;
  disabledCount: number;
  timestamp: string;
}

const IMPACT_STYLES = {
  low: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  high: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
} as const;

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [disabledCount, setDisabledCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    try {
      const user = localStorage.getItem('user');
      if (user) {
        const parsed = safeParseJsonString<Record<string, unknown>>(user);
        if ((parsed as any).role === 'super_admin') {
          setAccessAllowed(true);
        } else {
          setAccessAllowed(false);
        }
      } else {
        setAccessAllowed(false);
      }
    } catch {
      setAccessAllowed(false);
    }
  }, []);

  const fetchFlags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch('/api/admin/feature-flags');
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to load feature flags');
      }
      const data: FlagResponse = await response.json();
      setFlags(data.flags);
      setDisabledCount(data.disabledCount);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessAllowed) {
      fetchFlags();
    }
  }, [accessAllowed, fetchFlags]);

  const toggleFlag = async (flag: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;
    const flagItem = flags.find((f) => f.flag === flag);

    if (
      flagItem?.impactLevel === 'high' &&
      !newEnabled &&
      !window.confirm(
        `WARNING: "${flagItem.description}" has HIGH impact. Disabling this will affect users. Are you sure?`
      )
    ) {
      return;
    }

    try {
      setToggling(flag);
      const response = await apiFetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag, enabled: newEnabled }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to toggle flag');
      }

      setFlags((prev) => prev.map((f) => (f.flag === flag ? { ...f, enabled: newEnabled } : f)));
      setDisabledCount((prev) => prev + (newEnabled ? -1 : 1));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to toggle flag');
    } finally {
      setToggling(null);
    }
  };

  if (accessAllowed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!accessAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Access Denied</h1>
          <p className="text-gray-600">Feature flag management requires super admin access.</p>
        </div>
      </div>
    );
  }

  const categories = ['all', ...Array.from(new Set(flags.map((f) => f.category)))];
  const filteredFlags =
    filterCategory === 'all' ? flags : flags.filter((f) => f.category === filterCategory);

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Feature Flags</h1>
        <p className="mt-1 text-gray-500">
          Toggle platform features for incident response and maintenance.
        </p>
      </div>

      {/* Status Bar */}
      <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-sm text-gray-500">Total Flags</span>
            <p className="text-lg font-semibold">{flags.length}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Active</span>
            <p className="text-lg font-semibold text-green-600">{flags.length - disabledCount}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Disabled</span>
            <p className="text-lg font-semibold text-red-600">{disabledCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-gray-400">
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchFlags}
            disabled={loading}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Warning when flags are disabled */}
      {disabledCount > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm font-medium text-yellow-800">
            {disabledCount} feature(s) currently disabled. Users may see 503 errors for affected
            functionality.
          </p>
        </div>
      )}

      {/* Category Filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              filterCategory === cat
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400'
            }`}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Flags List */}
      {loading && flags.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFlags.map((flag) => {
            const impact = IMPACT_STYLES[flag.impactLevel];
            const isToggling = toggling === flag.flag;

            return (
              <div
                key={flag.flag}
                className={`rounded-lg border bg-white p-4 transition-all ${
                  flag.enabled ? 'border-gray-200' : 'border-red-200 bg-red-50/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{flag.flag}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${impact.bg} ${impact.text} ${impact.border} border`}
                      >
                        {flag.impactLevel} impact
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {flag.category}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{flag.description}</p>
                  </div>

                  <button
                    onClick={() => toggleFlag(flag.flag, flag.enabled)}
                    disabled={isToggling}
                    className="relative ml-4"
                    title={flag.enabled ? 'Disable feature' : 'Enable feature'}
                  >
                    <div
                      className={`h-6 w-12 rounded-full transition-colors ${
                        isToggling ? 'bg-gray-300' : flag.enabled ? 'bg-green-500' : 'bg-red-400'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          flag.enabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                      />
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
