'use client';

/**
 * Health Score Dashboard
 * Unified view of all health metrics with a calculated health score.
 * Production: no demo data; shows empty state when no data from API.
 */

import { useEffect, useState } from 'react';
import {
  Scale,
  Droplet,
  Moon,
  Activity,
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Info,
  Target,
  Flame,
} from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import Link from 'next/link';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';

interface HealthMetric {
  id: string;
  name: string;
  value: number | string;
  unit: string;
  target?: number;
  trend: 'up' | 'down' | 'stable';
  trendValue?: string;
  score: number; // 0-100 contribution to health score
  lastUpdated: string;
  icon: typeof Scale;
  color: string;
}

interface HealthScoreData {
  overallScore: number;
  previousScore: number | null; // From historical snapshots when available
  metrics: HealthMetric[];
  insights: string[];
  weeklyTrend: number[] | null; // From historical daily scores when available
}

export default function HealthScorePage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [data, setData] = useState<HealthScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  useEffect(() => {
    fetchHealthScore();
  }, []);

  const fetchHealthScore = async () => {
    setLoadError(null);
    try {
      const res = await portalFetch('/api/patient-portal/health-score');
      const err = getPortalResponseError(res);
      if (err) {
        setLoadError(err);
        setLoading(false);
        return;
      }
      if (res.ok) {
        const result = await safeParseJson(res);
        setData(
          result !== null && typeof result === 'object' ? (result as HealthScoreData) : null
        );
      }
    } catch (error) {
      logger.error('Failed to fetch health score', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    } finally {
      setLoading(false);
    }
  };

  const displayData = data;
  const scoreDiff =
    displayData?.previousScore != null ? displayData.overallScore - displayData.previousScore : null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="font-medium text-amber-900">{loadError}</p>
          <Link
            href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/health-score`)}&reason=session_expired`}
            className="mt-4 inline-block rounded-xl px-4 py-2 font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
          >
            Log in
          </Link>
        </div>
      </div>
    );
  }

  if (!displayData) {
    return (
      <div className="min-h-[60vh] px-4 py-8">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <Activity className="mx-auto h-12 w-12 text-gray-300" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No health score data yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Log weight, water, exercise, and sleep in Progress to build your health score.
          </p>
          <Link
            href={`${PATIENT_PORTAL_PATH}/progress`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2 font-medium text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Go to Progress
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Health Score</h1>
        <p className="mt-1 text-gray-600">Your personalized health overview</p>
      </div>

      {/* Main Score Card */}
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Overall Health Score</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-6xl font-bold">{displayData.overallScore}</span>
              <span className="text-2xl text-gray-400">/100</span>
            </div>
            {scoreDiff != null && (
              <div
                className={`mt-2 flex items-center gap-1 ${
                  scoreDiff >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {scoreDiff >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">
                  {scoreDiff >= 0 ? '+' : ''}
                  {scoreDiff} from last week
                </span>
              </div>
            )}
          </div>

          {/* Score Ring */}
          <div className="relative h-32 w-32">
            <svg className="h-32 w-32 -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                className="text-gray-700"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke={getScoreColor(displayData.overallScore)}
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(displayData.overallScore / 100) * 352} 352`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-medium text-gray-300">
                {displayData.overallScore >= 80
                  ? 'Great!'
                  : displayData.overallScore >= 60
                    ? 'Good'
                    : 'Improving'}
              </span>
            </div>
          </div>
        </div>

        {/* Weekly Trend Mini Chart - only shown when historical data is available */}
        {displayData.weeklyTrend && displayData.weeklyTrend.length > 0 ? (
          <div className="mt-6 border-t border-gray-700 pt-4">
            <p className="mb-2 text-sm text-gray-400">This Week</p>
            <div className="flex h-12 items-end gap-1">
              {displayData.weeklyTrend?.map((score, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t transition-all"
                  style={{
                    height: `${(score / 100) * 100}%`,
                    backgroundColor:
                      i === (displayData.weeklyTrend?.length ?? 0) - 1
                        ? getScoreColor(score)
                        : 'rgba(255,255,255,0.2)',
                  }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>Mon</span>
              <span>Today</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Metrics Grid */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        {displayData.metrics.map((metric) => {
          const MetricIcon = metric.icon;
          const progress =
            metric.target && typeof metric.value === 'number'
              ? Math.min(100, Math.abs((metric.value / metric.target) * 100))
              : metric.score;

          return (
            <button
              key={metric.id}
              onClick={() => setSelectedMetric(selectedMetric === metric.id ? null : metric.id)}
              className={`rounded-xl bg-white p-4 text-left shadow-sm transition-all ${
                selectedMetric === metric.id ? 'ring-2 ring-offset-2' : ''
              }`}
              style={
                selectedMetric === metric.id
                  ? ({ '--tw-ring-color': metric.color } as React.CSSProperties)
                  : {}
              }
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${metric.color}20` }}
                >
                  <MetricIcon className="h-4 w-4" style={{ color: metric.color }} />
                </div>
                <span className="text-sm text-gray-600">{metric.name}</span>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-gray-900">
                  {typeof metric.value === 'number'
                    ? metric.value > 0 && metric.id === 'weight'
                      ? `+${metric.value}`
                      : metric.value
                    : metric.value}
                </span>
                <span className="text-sm text-gray-500">{metric.unit}</span>
              </div>

              <div className="mt-2 flex items-center gap-1">
                <TrendIcon trend={metric.trend} />
                {metric.trendValue && (
                  <span className="text-xs text-gray-500">{metric.trendValue}</span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: metric.color,
                  }}
                />
              </div>

              {selectedMetric === metric.id && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Score contribution</span>
                    <span className="font-semibold" style={{ color: metric.color }}>
                      {metric.score}/100
                    </span>
                  </div>
                  {metric.target && (
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-gray-600">Target</span>
                      <span className="font-medium">
                        {metric.target} {metric.unit}
                      </span>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">Last updated: {metric.lastUpdated}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* AI Insights */}
      <div className="mb-6 rounded-xl bg-[var(--brand-primary-light)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Info className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Insights</h3>
        </div>
        <ul className="space-y-2">
          {displayData.insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-0.5 text-blue-500">•</span>
              {insight}
            </li>
          ))}
        </ul>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900">Improve Your Score</h3>
        <Link
          href={`${PATIENT_PORTAL_PATH}/progress`}
          className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm transition-colors hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <Scale className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Log Your Progress</p>
              <p className="text-sm text-gray-500">Weight, water, exercise, and more</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </Link>

        <Link
          href={`${PATIENT_PORTAL_PATH}/achievements`}
          className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm transition-colors hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
              <Target className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">View Goals & Achievements</p>
              <p className="text-sm text-gray-500">Track your milestones</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </Link>
      </div>
    </div>
  );
}
