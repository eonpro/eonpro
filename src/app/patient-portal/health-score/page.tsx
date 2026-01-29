'use client';

/**
 * Health Score Dashboard
 * Unified view of all health metrics with a calculated health score
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
  previousScore: number;
  metrics: HealthMetric[];
  insights: string[];
  weeklyTrend: number[];
}

export default function HealthScorePage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [data, setData] = useState<HealthScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  useEffect(() => {
    fetchHealthScore();
  }, []);

  const fetchHealthScore = async () => {
    try {
      const res = await fetch('/api/patient-portal/health-score');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch health score:', error);
    } finally {
      setLoading(false);
    }
  };

  // Demo data for visualization
  const demoData: HealthScoreData = {
    overallScore: 78,
    previousScore: 72,
    metrics: [
      {
        id: 'weight',
        name: 'Weight Progress',
        value: -12.5,
        unit: 'lbs',
        target: -25,
        trend: 'up',
        trendValue: '-2.3 this week',
        score: 85,
        lastUpdated: 'Today',
        icon: Scale,
        color: '#22c55e',
      },
      {
        id: 'hydration',
        name: 'Hydration',
        value: 58,
        unit: 'oz/day avg',
        target: 64,
        trend: 'up',
        trendValue: '+8oz from last week',
        score: 75,
        lastUpdated: 'Today',
        icon: Droplet,
        color: '#3b82f6',
      },
      {
        id: 'sleep',
        name: 'Sleep',
        value: 7.2,
        unit: 'hrs/night',
        target: 8,
        trend: 'stable',
        trendValue: 'Same as last week',
        score: 80,
        lastUpdated: 'Yesterday',
        icon: Moon,
        color: '#8b5cf6',
      },
      {
        id: 'exercise',
        name: 'Exercise',
        value: 120,
        unit: 'min/week',
        target: 150,
        trend: 'up',
        trendValue: '+30min from last week',
        score: 70,
        lastUpdated: '2 days ago',
        icon: Activity,
        color: '#f97316',
      },
      {
        id: 'adherence',
        name: 'Medication',
        value: 100,
        unit: '% adherence',
        trend: 'stable',
        score: 100,
        lastUpdated: 'This week',
        icon: Heart,
        color: '#ec4899',
      },
      {
        id: 'streak',
        name: 'Logging Streak',
        value: 14,
        unit: 'days',
        trend: 'up',
        trendValue: 'Personal best!',
        score: 90,
        lastUpdated: 'Active',
        icon: Flame,
        color: '#ef4444',
      },
    ],
    insights: [
      'Your hydration has improved! Keep drinking water throughout the day.',
      'Great job maintaining your medication schedule this week.',
      'Consider adding 30 more minutes of exercise to hit your weekly goal.',
    ],
    weeklyTrend: [72, 73, 74, 75, 76, 77, 78],
  };

  const displayData = data || demoData;
  const scoreDiff = displayData.overallScore - displayData.previousScore;

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Health Score</h1>
        <p className="text-gray-600 mt-1">Your personalized health overview</p>
      </div>

      {/* Main Score Card */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Overall Health Score</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-6xl font-bold">{displayData.overallScore}</span>
              <span className="text-2xl text-gray-400">/100</span>
            </div>
            <div
              className={`flex items-center gap-1 mt-2 ${
                scoreDiff >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {scoreDiff >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">
                {scoreDiff >= 0 ? '+' : ''}
                {scoreDiff} from last week
              </span>
            </div>
          </div>

          {/* Score Ring */}
          <div className="relative w-32 h-32">
            <svg className="w-32 h-32 -rotate-90">
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

        {/* Weekly Trend Mini Chart */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 mb-2">This Week</p>
          <div className="flex items-end gap-1 h-12">
            {displayData.weeklyTrend.map((score, i) => (
              <div
                key={i}
                className="flex-1 rounded-t transition-all"
                style={{
                  height: `${(score / 100) * 100}%`,
                  backgroundColor:
                    i === displayData.weeklyTrend.length - 1
                      ? getScoreColor(score)
                      : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Mon</span>
            <span>Today</span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
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
              className={`bg-white rounded-xl p-4 shadow-sm text-left transition-all ${
                selectedMetric === metric.id ? 'ring-2 ring-offset-2' : ''
              }`}
              style={selectedMetric === metric.id ? { ringColor: metric.color } : {}}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${metric.color}20` }}
                >
                  <MetricIcon className="w-4 h-4" style={{ color: metric.color }} />
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

              <div className="flex items-center gap-1 mt-2">
                <TrendIcon trend={metric.trend} />
                {metric.trendValue && (
                  <span className="text-xs text-gray-500">{metric.trendValue}</span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: metric.color,
                  }}
                />
              </div>

              {selectedMetric === metric.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Score contribution</span>
                    <span className="font-semibold" style={{ color: metric.color }}>
                      {metric.score}/100
                    </span>
                  </div>
                  {metric.target && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-600">Target</span>
                      <span className="font-medium">
                        {metric.target} {metric.unit}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Last updated: {metric.lastUpdated}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* AI Insights */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Insights</h3>
        </div>
        <ul className="space-y-2">
          {displayData.insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="text-blue-500 mt-0.5">•</span>
              {insight}
            </li>
          ))}
        </ul>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900">Improve Your Score</h3>
        <Link
          href="/patient-portal/progress"
          className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Scale className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Log Your Progress</p>
              <p className="text-sm text-gray-500">Weight, water, exercise, and more</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </Link>

        <Link
          href="/patient-portal/achievements"
          className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
              <Target className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">View Goals & Achievements</p>
              <p className="text-sm text-gray-500">Track your milestones</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </Link>
      </div>
    </div>
  );
}
