'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import { TrendingDown, TrendingUp, Scale, BarChart3 } from 'lucide-react';

interface WeightProgressSummaryProps {
  patientId: number;
}

interface WeightEntry {
  date: Date;
  weight: number;
  id: number;
  source: string;
}

/**
 * WeightProgressSummary - Shows a summary of patient's weight progress
 * on the patient profile overview page.
 *
 * Displays: Starting weight, Current weight, Change, Check-ins count
 * This mirrors the summary shown on the patient portal progress page.
 */
export default function WeightProgressSummary({ patientId }: WeightProgressSummaryProps) {
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeightData = async () => {
      try {
        const response = await fetch(
          `/api/patient-progress/weight?patientId=${patientId}&limit=100`,
          { headers: getAuthHeaders(), credentials: 'include' }
        );
        if (response.ok) {
          const result = await response.json();
          const logs = result.data || result || [];
          const formattedData = (Array.isArray(logs) ? logs : []).map((log: any) => ({
            date: new Date(log.recordedAt),
            weight: log.weight,
            id: log.id,
            source: log.source,
          }));
          // Sort by date ascending (oldest first)
          formattedData.sort((a: WeightEntry, b: WeightEntry) => a.date.getTime() - b.date.getTime());
          setWeightData(formattedData);
        }
      } catch (error) {
        console.error('Failed to fetch weight data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (patientId) {
      fetchWeightData();
    }
  }, [patientId]);

  // Calculate stats
  const startingWeight = weightData.length > 0 ? weightData[0].weight : null;
  const currentWeight = weightData.length > 0 ? weightData[weightData.length - 1].weight : null;
  const weightChange = startingWeight && currentWeight ? currentWeight - startingWeight : null;
  const checkIns = weightData.length;
  const percentChange = startingWeight && weightChange
    ? ((weightChange / startingWeight) * 100).toFixed(1)
    : null;

  // If no weight data, show placeholder with link to progress tab
  if (!loading && weightData.length === 0) {
    return (
      <div className="mt-6 flex h-48 items-center justify-center rounded-xl bg-[#efece7] p-4">
        <Link
          href={`/patients/${patientId}?tab=progress`}
          className="text-center text-gray-500 transition-colors group"
        >
          <BarChart3 className="mx-auto mb-2 h-8 w-8 opacity-50 group-hover:opacity-80 transition-opacity" />
          <p className="text-sm font-medium group-hover:text-gray-700">Weight Progress Tracking</p>
          <p className="text-xs">No weight data yet. View Progress tab to add entries →</p>
        </Link>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="mt-6 rounded-xl bg-[#efece7] p-4">
        <div className="animate-pulse">
          <div className="mb-3 h-4 w-32 rounded bg-gray-300"></div>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg bg-white p-3">
                <div className="mb-2 h-3 w-16 rounded bg-gray-200"></div>
                <div className="h-6 w-12 rounded bg-gray-200"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl bg-[#efece7] p-4">
      {/* Header with link */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">Weight Progress</h3>
        </div>
        <Link
          href={`/patients/${patientId}?tab=progress`}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          View full chart →
        </Link>
      </div>

      {/* Progress percentage badge */}
      {percentChange !== null && (
        <div className="mb-3 flex items-center gap-2">
          {weightChange !== null && weightChange < 0 ? (
            <TrendingDown className="h-4 w-4 text-green-600" />
          ) : weightChange !== null && weightChange > 0 ? (
            <TrendingUp className="h-4 w-4 text-amber-600" />
          ) : null}
          <span
            className={`text-sm font-semibold ${
              weightChange !== null && weightChange < 0
                ? 'text-green-600'
                : weightChange !== null && weightChange > 0
                  ? 'text-amber-600'
                  : 'text-gray-600'
            }`}
          >
            {parseFloat(percentChange) > 0 ? '+' : ''}{percentChange}% since start
          </span>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-3">
        {/* Starting Weight */}
        <div className="rounded-lg bg-white p-3 text-center">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Starting</p>
          <p className="text-lg font-bold text-gray-900">
            {startingWeight !== null ? startingWeight : '—'}
          </p>
          <p className="text-xs text-gray-400">lbs</p>
        </div>

        {/* Current Weight */}
        <div className="rounded-lg bg-white p-3 text-center">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Current</p>
          <p className="text-lg font-bold text-gray-900">
            {currentWeight !== null ? currentWeight : '—'}
          </p>
          <p className="text-xs text-gray-400">lbs</p>
        </div>

        {/* Change */}
        <div className="rounded-lg bg-white p-3 text-center">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Change</p>
          <p
            className={`text-lg font-bold ${
              weightChange !== null && weightChange < 0
                ? 'text-green-600'
                : weightChange !== null && weightChange > 0
                  ? 'text-amber-600'
                  : 'text-gray-900'
            }`}
          >
            {weightChange !== null ? (weightChange > 0 ? '+' : '') + weightChange.toFixed(1) : '—'}
          </p>
          <p className="text-xs text-gray-400">lbs</p>
        </div>

        {/* Check-ins */}
        <div className="rounded-lg bg-white p-3 text-center">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Check-ins</p>
          <p className="text-lg font-bold text-gray-900">{checkIns}</p>
          <p className="text-xs text-gray-400">total</p>
        </div>
      </div>

      {/* Recent entries indicator */}
      {weightData.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <div className="flex -space-x-1">
            {weightData.slice(-3).map((entry) => (
              <div
                key={entry.id}
                className={`h-2 w-2 rounded-full border border-white ${
                  entry.source === 'intake'
                    ? 'bg-purple-500'
                    : entry.source === 'provider'
                      ? 'bg-blue-500'
                      : 'bg-green-500'
                }`}
                title={`${entry.source === 'intake' ? 'Intake' : entry.source === 'provider' ? 'Provider' : 'Patient'} entry`}
              />
            ))}
          </div>
          <span>
            Last entry:{' '}
            {weightData[weightData.length - 1].date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
          {weightData.some((e) => e.source === 'intake') && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700">
              Intake recorded
            </span>
          )}
          {weightData.some((e) => e.source === 'patient') && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
              Patient logged
            </span>
          )}
        </div>
      )}
    </div>
  );
}
