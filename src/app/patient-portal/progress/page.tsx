'use client';

import { useState, useEffect } from 'react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import WeightTracker from '@/components/WeightTracker';
import { TrendingDown, TrendingUp, Activity, Target, Calendar, Award, Flame } from 'lucide-react';

interface WeightLog {
  id: number;
  recordedAt: string;
  weight: number;
}

export default function ProgressPage() {
  const { branding } = useClinicBranding();
  const accentColor = branding?.accentColor || '#d3f931';
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [patientId, setPatientId] = useState<number | null>(null);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tracker' | 'history'>('tracker');

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      setPatientId(userData.patientId || userData.id);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (patientId) {
      fetchWeightHistory();
    }
  }, [patientId]);

  const fetchWeightHistory = async () => {
    try {
      const response = await fetch(`/api/patient-progress/weight?patientId=${patientId}`);
      if (response.ok) {
        const logs = await response.json();
        setWeightLogs(logs);
      }
    } catch (error) {
      console.error('Failed to fetch weight history:', error);
    }
  };

  const sortedLogs = [...weightLogs].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  const latestWeight = sortedLogs[sortedLogs.length - 1]?.weight;
  const startingWeight = sortedLogs[0]?.weight;
  const totalChange = latestWeight && startingWeight ? latestWeight - startingWeight : 0;
  const percentChange = startingWeight ? (totalChange / startingWeight) * 100 : 0;

  const lastWeekLogs = sortedLogs.filter((log) => {
    const logDate = new Date(log.recordedAt);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return logDate >= weekAgo;
  });
  const weeklyAverage =
    lastWeekLogs.length > 0
      ? lastWeekLogs.reduce((sum, log) => sum + log.weight, 0) / lastWeekLogs.length
      : null;

  const goalWeight = 150;
  const progressToGoal = latestWeight
    ? ((startingWeight - latestWeight) / (startingWeight - goalWeight)) * 100
    : 0;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">Weight Progress</h1>
        <p className="mt-1 text-sm text-gray-500">Track your weight loss journey</p>
      </div>

      {/* Stats Grid - 2x2 on mobile, 4 columns on larger screens */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {/* Current Weight */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
              <Activity className="h-4 w-4 text-gray-500" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{latestWeight || '--'}</p>
          <p className="text-xs font-medium text-gray-500">Current (lbs)</p>
        </div>

        {/* Total Change */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                totalChange <= 0 ? 'bg-emerald-100' : 'bg-rose-100'
              }`}
            >
              {totalChange <= 0 ? (
                <TrendingDown className="h-4 w-4 text-emerald-600" />
              ) : (
                <TrendingUp className="h-4 w-4 text-rose-600" />
              )}
            </div>
          </div>
          <p
            className={`text-2xl font-black ${totalChange <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
          >
            {totalChange > 0 ? '+' : ''}
            {totalChange.toFixed(1)}
          </p>
          <p className="text-xs font-medium text-gray-500">Change (lbs)</p>
        </div>

        {/* Weekly Average */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <Calendar className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">
            {weeklyAverage ? weeklyAverage.toFixed(1) : '--'}
          </p>
          <p className="text-xs font-medium text-gray-500">Weekly Avg</p>
        </div>

        {/* Check-ins */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
              <Flame className="h-4 w-4 text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{weightLogs.length}</p>
          <p className="text-xs font-medium text-gray-500">Check-ins</p>
        </div>
      </div>

      {/* Goal Progress Card */}
      {goalWeight && latestWeight && startingWeight && (
        <div className="mb-6 overflow-hidden rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <Target className="h-5 w-5" style={{ color: primaryColor }} />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Goal Progress</h2>
                <p className="text-xs text-gray-500">Target: {goalWeight} lbs</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black" style={{ color: primaryColor }}>
                {Math.min(100, Math.max(0, progressToGoal)).toFixed(0)}%
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, Math.max(0, progressToGoal))}%`,
                backgroundColor: primaryColor,
              }}
            />
          </div>

          {/* Labels */}
          <div className="mt-3 flex justify-between text-xs text-gray-500">
            <span>{startingWeight} lbs</span>
            <span className="font-bold text-gray-700">{latestWeight} lbs</span>
            <span>{goalWeight} lbs</span>
          </div>
        </div>
      )}

      {/* Tab Buttons - Full width, touch-friendly */}
      <div className="mb-6 flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
        <button
          onClick={() => setActiveTab('tracker')}
          className={`flex-1 rounded-xl py-3.5 text-sm font-bold transition-all active:scale-[0.98] ${
            activeTab === 'tracker' ? 'text-white shadow-md' : 'text-gray-500'
          }`}
          style={activeTab === 'tracker' ? { backgroundColor: primaryColor } : {}}
        >
          Weight Tracker
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 rounded-xl py-3.5 text-sm font-bold transition-all active:scale-[0.98] ${
            activeTab === 'history' ? 'text-white shadow-md' : 'text-gray-500'
          }`}
          style={activeTab === 'history' ? { backgroundColor: primaryColor } : {}}
        >
          History
        </button>
      </div>

      {/* Main Content */}
      {activeTab === 'tracker' ? (
        <WeightTracker
          patientId={patientId || undefined}
          variant="hims"
          accentColor={accentColor}
          showBMI={true}
          onWeightSaved={fetchWeightHistory}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <h2 className="font-bold text-gray-900">Weight History</h2>
            <p className="text-xs text-gray-500">{sortedLogs.length} total entries</p>
          </div>

          {sortedLogs.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <Activity className="h-8 w-8 text-gray-300" />
              </div>
              <p className="font-semibold text-gray-600">No weight logs yet</p>
              <p className="mt-1 text-sm text-gray-400">Start tracking to see your history</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {[...sortedLogs].reverse().map((log, index, arr) => {
                const prevLog = arr[index + 1];
                const change = prevLog ? log.weight - prevLog.weight : 0;

                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between px-4 py-4 active:bg-gray-50"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">
                        {new Date(log.recordedAt).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(log.recordedAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-gray-900">{log.weight} lbs</p>
                      {change !== 0 && (
                        <p
                          className={`text-xs font-bold ${change < 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                        >
                          {change > 0 ? '+' : ''}
                          {change.toFixed(1)} lbs
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tips Card */}
      <div className="mt-6 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Award className="h-5 w-5 text-blue-600" />
          <h3 className="font-bold text-gray-900">Weight Loss Tips</h3>
        </div>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            Weigh yourself at the same time each day
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            Focus on weekly trends, not daily changes
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            Stay hydrated for consistent measurements
          </li>
        </ul>
      </div>
    </div>
  );
}
