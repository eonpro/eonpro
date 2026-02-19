'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import { Droplets, Dumbbell, Moon, Utensils } from 'lucide-react';
import { logger } from '@/lib/logger';

interface PatientProgressSummaryProps {
  patientId: number;
}

interface ProgressSnapshot {
  water: { todayTotal: number; unit: string; entries: number } | null;
  exercise: { weeklyMinutes: number; entries: number; latestType: string } | null;
  sleep: { avgQuality: number; avgHours: number; entries: number } | null;
  nutrition: { todayCalories: number; entries: number } | null;
}

export default function PatientProgressSummary({ patientId }: PatientProgressSummaryProps) {
  const [data, setData] = useState<ProgressSnapshot>({
    water: null,
    exercise: null,
    sleep: null,
    nutrition: null,
  });
  const [loading, setLoading] = useState(true);
  const [hasAnyData, setHasAnyData] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    const fetchOpts = { headers: getAuthHeaders(), credentials: 'include' as const };

    const waterP = fetch(`/api/patient-progress/water?patientId=${patientId}`, fetchOpts)
      .then(async (r) => {
        if (!r.ok) return null;
        const body = await r.json();
        const entries = Array.isArray(body.data) ? body.data.length : 0;
        return entries > 0
          ? { todayTotal: body.meta?.todayTotal ?? 0, unit: 'oz', entries }
          : null;
      })
      .catch(() => null);

    const exerciseP = fetch(`/api/patient-progress/exercise?patientId=${patientId}`, fetchOpts)
      .then(async (r) => {
        if (!r.ok) return null;
        const body = await r.json();
        const logs = Array.isArray(body.data) ? body.data : [];
        if (logs.length === 0) return null;
        const weeklyMinutes = body.meta?.weeklyMinutes ?? logs.reduce((s: number, l: { duration?: number }) => s + (l.duration ?? 0), 0);
        return { weeklyMinutes, entries: logs.length, latestType: logs[0]?.activityType ?? 'Exercise' };
      })
      .catch(() => null);

    const sleepP = fetch(`/api/patient-progress/sleep?patientId=${patientId}`, fetchOpts)
      .then(async (r) => {
        if (!r.ok) return null;
        const body = await r.json();
        const logs = Array.isArray(body.data) ? body.data : [];
        if (logs.length === 0) return null;
        const avgQuality = body.meta?.averageQuality ?? logs.reduce((s: number, l: { quality?: number }) => s + (l.quality ?? 0), 0) / logs.length;
        const avgHours = body.meta?.averageHours ?? 0;
        return { avgQuality: Math.round(avgQuality * 10) / 10, avgHours: Math.round(avgHours * 10) / 10, entries: logs.length };
      })
      .catch(() => null);

    const nutritionP = fetch(`/api/patient-progress/nutrition?patientId=${patientId}`, fetchOpts)
      .then(async (r) => {
        if (!r.ok) return null;
        const body = await r.json();
        const logs = Array.isArray(body.data) ? body.data : [];
        if (logs.length === 0) return null;
        const todayCalories = body.meta?.todayCalories ?? 0;
        return { todayCalories, entries: logs.length };
      })
      .catch(() => null);

    Promise.all([waterP, exerciseP, sleepP, nutritionP])
      .then(([water, exercise, sleep, nutrition]) => {
        setData({ water, exercise, sleep, nutrition });
        setHasAnyData(!!(water || exercise || sleep || nutrition));
      })
      .catch((err) => {
        logger.warn('Failed to fetch progress summary', {
          patientId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className="mt-4 rounded-xl bg-[#efece7] p-4">
        <div className="animate-pulse">
          <div className="mb-3 h-4 w-40 rounded bg-gray-300" />
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg bg-white p-3">
                <div className="mb-2 h-3 w-16 rounded bg-gray-200" />
                <div className="h-6 w-12 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!hasAnyData) return null;

  return (
    <div className="mt-4 rounded-xl bg-[#efece7] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Activity Summary</h3>
        <Link
          href={`/patients/${patientId}?tab=progress`}
          className="text-xs text-gray-500 transition-colors hover:text-gray-700"
        >
          View all →
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {/* Water */}
        <div className="rounded-lg bg-white p-3 text-center">
          <Droplets className="mx-auto mb-1 h-4 w-4 text-blue-500" />
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">Water</p>
          {data.water ? (
            <>
              <p className="text-lg font-bold text-gray-900">{data.water.todayTotal}</p>
              <p className="text-xs text-gray-400">{data.water.unit} today</p>
            </>
          ) : (
            <p className="text-xs text-gray-400">No entries</p>
          )}
        </div>

        {/* Exercise */}
        <div className="rounded-lg bg-white p-3 text-center">
          <Dumbbell className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">Exercise</p>
          {data.exercise ? (
            <>
              <p className="text-lg font-bold text-gray-900">{data.exercise.weeklyMinutes}</p>
              <p className="text-xs text-gray-400">min this week</p>
            </>
          ) : (
            <p className="text-xs text-gray-400">No entries</p>
          )}
        </div>

        {/* Sleep */}
        <div className="rounded-lg bg-white p-3 text-center">
          <Moon className="mx-auto mb-1 h-4 w-4 text-indigo-500" />
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">Sleep</p>
          {data.sleep ? (
            <>
              <p className="text-lg font-bold text-gray-900">{data.sleep.avgQuality}/10</p>
              <p className="text-xs text-gray-400">avg quality</p>
            </>
          ) : (
            <p className="text-xs text-gray-400">No entries</p>
          )}
        </div>

        {/* Nutrition */}
        <div className="rounded-lg bg-white p-3 text-center">
          <Utensils className="mx-auto mb-1 h-4 w-4 text-amber-500" />
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">Nutrition</p>
          {data.nutrition ? (
            <>
              <p className="text-lg font-bold text-gray-900">{data.nutrition.todayCalories}</p>
              <p className="text-xs text-gray-400">kcal today</p>
            </>
          ) : (
            <p className="text-xs text-gray-400">No entries</p>
          )}
        </div>
      </div>

      {/* Entry count footer */}
      <div className="mt-2 flex gap-3 text-xs text-gray-500">
        {data.water && <span>{data.water.entries} water logs</span>}
        {data.exercise && <span>{data.exercise.entries} workouts</span>}
        {data.sleep && <span>{data.sleep.entries} sleep logs</span>}
        {data.nutrition && <span>{data.nutrition.entries} meals</span>}
      </div>
    </div>
  );
}
