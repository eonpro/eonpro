'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '../lib/logger';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
} from 'chart.js';
import { format } from 'date-fns';
import { apiFetch } from '@/lib/api/fetch';
import { toast } from '@/components/Toast';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  FileText,
  Play,
  Plus,
  Scale,
  Check,
  X,
  Droplets,
  Moon,
  Dumbbell,
  Utensils,
  Clock,
  Flame,
  Footprints,
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// =============================================================================
// Types
// =============================================================================

interface PatientProgressViewProps {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    orders?: any[];
  };
}

interface WeightEntry {
  date: Date;
  weight: number;
  id: number;
  notes: string | null;
  source: string;
}

interface WaterLog {
  id: number;
  amount: number;
  unit: string;
  source?: string;
  recordedAt: string;
  notes: string | null;
}

interface SleepLog {
  id: number;
  sleepStart: string;
  sleepEnd: string;
  duration: number;
  quality: number | null;
  source?: string;
  recordedAt: string;
  notes: string | null;
}

interface ExerciseLog {
  id: number;
  activityType: string;
  duration: number;
  intensity: string;
  calories: number | null;
  steps: number | null;
  distance: number | null;
  source?: string;
  recordedAt: string;
  notes: string | null;
}

interface NutritionLog {
  id: number;
  mealType: string;
  description: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  source?: string;
  recordedAt: string;
  notes: string | null;
}

// =============================================================================
// Helper: safe API fetch for progress data
// =============================================================================

async function fetchProgressData<T>(
  url: string,
  label: string
): Promise<T[]> {
  try {
    const response = await apiFetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (response.ok) {
      const result = await response.json();
      const list = result.data || result || [];
      return Array.isArray(list) ? list : [];
    }
    return [];
  } catch (error) {
    logger.error(`Failed to fetch ${label}`, {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return [];
  }
}

// =============================================================================
// Source badge — distinguishes manual vs device-synced entries
// =============================================================================

function SourceBadge({ source }: { source?: string }) {
  if (source === 'device') {
    return (
      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
        Device
      </span>
    );
  }
  if (source === 'intake') {
    return (
      <span className="rounded-full bg-[var(--brand-primary-light,#e0f2f1)] px-2 py-0.5 text-xs text-[var(--brand-primary,#4fa77e)]">
        Intake
      </span>
    );
  }
  if (source === 'provider') {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
        Provider
      </span>
    );
  }
  return null;
}

// =============================================================================
// Component
// =============================================================================

export default function PatientProgressView({ patient }: PatientProgressViewProps) {
  // Existing state
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);
  const [medicationReminders, setMedicationReminders] = useState<any[]>([]);
  const [hasActiveTreatment, setHasActiveTreatment] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);

  // New tracking states
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [waterMeta, setWaterMeta] = useState<{ todayTotal: number } | null>(null);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [sleepMeta, setSleepMeta] = useState<{
    avgSleepHours: number;
    avgQuality: number | null;
  } | null>(null);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [exerciseMeta, setExerciseMeta] = useState<{
    weeklyMinutes: number;
    weeklyCalories: number;
  } | null>(null);
  const [nutritionLogs, setNutritionLogs] = useState<NutritionLog[]>([]);
  const [nutritionMeta, setNutritionMeta] = useState<{
    todayCalories: number;
    todayProtein: number;
    todayCarbs: number;
    todayFat: number;
  } | null>(null);

  // Weight entry form state
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [weightDate, setWeightDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [weightNotes, setWeightNotes] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Seed hasActiveTreatment from tracking data; progress fetches below will also set it true
  useEffect(() => {
    const hasTracking = patient.orders?.some((order: any) =>
      order.events?.some((event: any) => event.type === 'TRACKING_UPDATED' || event.tracking)
    );
    if (hasTracking) {
      setHasActiveTreatment(true);
    }
  }, [patient.orders]);

  // Fetch weight data from API (same source as patient portal)
  const fetchWeightData = useCallback(async () => {
    if (!patient.id) return;
    try {
      const response = await apiFetch(
        `/api/patient-progress/weight?patientId=${patient.id}&limit=100`,
        { headers: getAuthHeaders(), credentials: 'include' }
      );
      if (response.ok) {
        const result = await response.json();
        const logs = result.data || result || [];
        const formattedData: WeightEntry[] = (Array.isArray(logs) ? logs : []).map((log: any) => ({
          date: new Date(log.recordedAt),
          weight: log.weight,
          id: log.id,
          notes: log.notes,
          source: log.source,
        }));
        setWeightData(formattedData);
        if (formattedData.length > 0) {
          setHasActiveTreatment(true);
        }
      }
    } catch (error) {
      logger.error('Failed to fetch weight data', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }, [patient.id]);

  // Fetch all tracking data on mount
  useEffect(() => {
    if (!patient.id) return;

    const fetchOpts = { headers: getAuthHeaders(), credentials: 'include' as const };

    const waterPromise = apiFetch(
      `/api/patient-progress/water?patientId=${patient.id}`,
      fetchOpts
    )
      .then(async (res) => {
        if (res.ok) {
          const result = await res.json();
          setWaterLogs(Array.isArray(result.data) ? result.data : []);
          setWaterMeta(result.meta || null);
          if (result.data?.length > 0) setHasActiveTreatment(true);
        }
      })
      .catch((err) => {
        logger.warn('Failed to fetch water logs', {
          patientId: patient.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });

    const sleepPromise = apiFetch(
      `/api/patient-progress/sleep?patientId=${patient.id}`,
      fetchOpts
    )
      .then(async (res) => {
        if (res.ok) {
          const result = await res.json();
          setSleepLogs(Array.isArray(result.data) ? result.data : []);
          setSleepMeta(result.meta || null);
          if (result.data?.length > 0) setHasActiveTreatment(true);
        }
      })
      .catch((err) => {
        logger.warn('Failed to fetch sleep logs', {
          patientId: patient.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });

    const exercisePromise = apiFetch(
      `/api/patient-progress/exercise?patientId=${patient.id}`,
      fetchOpts
    )
      .then(async (res) => {
        if (res.ok) {
          const result = await res.json();
          setExerciseLogs(Array.isArray(result.data) ? result.data : []);
          setExerciseMeta(result.meta || null);
          if (result.data?.length > 0) setHasActiveTreatment(true);
        }
      })
      .catch((err) => {
        logger.warn('Failed to fetch exercise logs', {
          patientId: patient.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });

    const nutritionPromise = apiFetch(
      `/api/patient-progress/nutrition?patientId=${patient.id}`,
      fetchOpts
    )
      .then(async (res) => {
        if (res.ok) {
          const result = await res.json();
          setNutritionLogs(Array.isArray(result.data) ? result.data : []);
          setNutritionMeta(result.meta || null);
          if (result.data?.length > 0) setHasActiveTreatment(true);
        }
      })
      .catch((err) => {
        logger.warn('Failed to fetch nutrition logs', {
          patientId: patient.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });

    const weightPromise = fetchWeightData();
    const remindersPromise = fetchProgressData<any>(
      `/api/patient-progress/medication-reminders?patientId=${patient.id}`,
      'medication reminders'
    ).then(setMedicationReminders);

    Promise.allSettled([
      weightPromise,
      remindersPromise,
      waterPromise,
      sleepPromise,
      exercisePromise,
      nutritionPromise,
    ]).then(() => setProgressLoaded(true));
  }, [patient.id, fetchWeightData]);

  // Handle adding new weight entry
  const handleAddWeight = async () => {
    if (!newWeight || isNaN(parseFloat(newWeight))) return;

    setSavingWeight(true);
    try {
      const response = await apiFetch('/api/patient-progress/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          patientId: patient.id,
          weight: parseFloat(newWeight),
          unit: 'lbs',
          notes: weightNotes || 'Entered by provider',
          recordedAt: new Date(weightDate).toISOString(),
        }),
      });

      if (response.ok) {
        await fetchWeightData();
        setNewWeight('');
        setWeightNotes('');
        setWeightDate(format(new Date(), 'yyyy-MM-dd'));
        setShowWeightForm(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        toast.error('Failed to save weight. Please try again.');
      }
    } catch (error) {
      logger.error('Failed to save weight', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      toast.error('Failed to save weight. Please try again.');
    } finally {
      setSavingWeight(false);
    }
  };

  const calculateProgress = () => {
    if (weightData.length < 2) return null;
    const initial = weightData[0].weight;
    const current = weightData[weightData.length - 1].weight;
    const change = Math.round((current - initial) * 10) / 10;
    const percentage = ((Math.abs(change) / initial) * 100).toFixed(1);
    return { change, percentage, trend: change < 0 ? 'down' : 'up' };
  };

  const progress = calculateProgress();

  // Compute total activity count for summary
  const totalActivities =
    weightData.length +
    medicationReminders.length +
    waterLogs.length +
    sleepLogs.length +
    exerciseLogs.length +
    nutritionLogs.length;

  if (!progressLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <span className="ml-3 text-gray-500">Loading progress data…</span>
      </div>
    );
  }

  if (!hasActiveTreatment && totalActivities === 0) {
    return (
      <div className="py-12 text-center">
        <Activity className="mx-auto mb-4 h-16 w-16 text-gray-400" />
        <h3 className="mb-2 text-lg font-semibold text-gray-700">No Progress Data</h3>
        <p className="mx-auto max-w-md text-gray-500">
          No weight, water, exercise, sleep, or nutrition entries have been logged yet.
          Progress data will appear here once the patient starts logging or their treatment begins.
        </p>
        <button
          type="button"
          onClick={() => setShowWeightForm(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Log First Weight
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* Progress Overview Cards                                            */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {/* Current Weight */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Current Weight</h3>
            {progress?.trend === 'down' ? (
              <TrendingDown className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingUp className="h-5 w-5 text-yellow-500" />
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {weightData[weightData.length - 1]?.weight || '--'} lbs
          </p>
          {progress && (
            <p
              className={`mt-1 text-sm ${progress.change < 0 ? 'text-green-600' : 'text-yellow-600'}`}
            >
              {progress.change > 0 ? '+' : ''}
              {progress.change} lbs ({progress.percentage}%)
            </p>
          )}
        </div>

        {/* Today's Water */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Today&apos;s Water</h3>
            <Droplets className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {waterMeta?.todayTotal || 0} oz
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {waterLogs.length} total logs
          </p>
        </div>

        {/* Weekly Exercise */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Weekly Exercise</h3>
            <Dumbbell className="h-5 w-5 text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {exerciseMeta?.weeklyMinutes || 0} min
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {exerciseMeta?.weeklyCalories || 0} cal burned
          </p>
        </div>

        {/* Activity Summary */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Total Activities</h3>
            <Activity className="h-5 w-5 text-[var(--brand-primary,#4fa77e)]" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalActivities}</p>
          <p className="mt-1 text-sm text-gray-500">
            across all tracking
          </p>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Weight Tracker                                                     */}
      {/* ================================================================== */}
      <div
        className="rounded-xl border p-6"
        style={{ backgroundColor: '#faffac', borderColor: '#a8ac40' }}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Weight Tracker</h2>
            <p className="mt-1 text-sm text-gray-600">Track patient&apos;s weight loss journey</p>
          </div>
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1 rounded-full bg-green-500 px-3 py-1 text-xs text-white">
                <Check className="h-3 w-3" /> Saved!
              </span>
            )}
            <span
              className="rounded-full px-3 py-1 text-xs text-green-800"
              style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}
            >
              {weightData.length} entries
            </span>
            <button
              onClick={() => setShowWeightForm(!showWeightForm)}
              className="flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-3 w-3" />
              Add Weight
            </button>
          </div>
        </div>

        {/* Add Weight Form */}
        {showWeightForm && (
          <div className="mb-6 rounded-lg border border-green-300 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-medium text-gray-900">
                <Scale className="h-4 w-4" />
                Add Weight Entry
              </h3>
              <button
                onClick={() => setShowWeightForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Weight (lbs)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  placeholder="e.g., 185.5"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={weightNotes}
                  onChange={(e) => setWeightNotes(e.target.value)}
                  placeholder="e.g., Weekly check-in"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowWeightForm(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddWeight}
                disabled={!newWeight || savingWeight}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingWeight ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Save Weight
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              This weight entry will appear in the patient&apos;s portal dashboard.
            </p>
          </div>
        )}

        {/* Chart */}
        <div
          className="relative h-64 overflow-hidden rounded-lg border p-4 shadow-sm"
          style={{ backgroundColor: '#faffac', borderColor: '#a8ac40' }}
        >
          {weightData.length > 0 ? (
            <div className="h-full w-full [&_canvas]:!bg-transparent">
              <Line
                data={{
                  labels: weightData.map((d) => format(d.date, 'M/d')),
                  datasets: [
                    {
                      data: weightData.map((d) => d.weight),
                      borderColor: '#16a34a',
                      pointBackgroundColor: '#16a34a',
                      pointBorderColor: '#fff',
                      pointBorderWidth: 2,
                      pointRadius: 6,
                      fill: true,
                      tension: 0.4,
                      backgroundColor: 'rgba(22, 163, 74, 0.15)',
                    },
                  ],
                }}
                options={
                  {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: 0 },
                    plugins: {
                      legend: { display: false },
                      tooltip: { backgroundColor: 'rgba(255,255,255,0.95)' },
                    },
                    scales: {
                      x: {
                        title: { display: true, text: 'Date', color: '#374151' },
                        ticks: { color: '#374151' },
                        grid: { color: 'rgba(0,0,0,0.06)' },
                      },
                      y: {
                        title: { display: true, text: 'Weight (lbs)', color: '#374151' },
                        ticks: { color: '#374151' },
                        grid: { color: 'rgba(0,0,0,0.06)' },
                      },
                    },
                  } as ChartOptions<'line'>
                }
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-gray-600">
              <Scale className="mb-2 h-10 w-10 text-gray-500" />
              <p className="text-sm font-medium">No weight data yet</p>
              <p className="mt-1 text-xs">Add weight above or patient can log from their portal</p>
            </div>
          )}
        </div>

        {/* Recent Weight Entries */}
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-gray-700">Recent Weight Logs</h3>
          <div className="space-y-2">
            {weightData.length > 0 ? (
              weightData.slice(0, 5).map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  className="flex items-center justify-between rounded-lg px-4 py-3"
                  style={{ backgroundColor: '#faffac' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 rounded-full ${idx === 0 ? 'bg-green-500' : 'bg-gray-300'}`}
                    />
                    <div>
                      <span className="text-sm font-medium">
                        {format(entry.date, 'MMM d, yyyy')}
                      </span>
                      {entry.notes && <p className="text-xs text-gray-500">{entry.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{entry.weight} lbs</span>
                    <SourceBadge source={entry.source} />
                    {idx === 0 && progress && (
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          progress.change < 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {progress.change > 0 ? '+' : ''}
                        {progress.change}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg py-4 text-center" style={{ backgroundColor: '#faffac' }}>
                <p className="text-sm text-gray-600">No weight data logged yet</p>
                <p className="mt-1 text-xs text-gray-500">
                  Click &quot;Add Weight&quot; above or patient can log from their dashboard
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Water Intake + Sleep – side by side                                */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Water Intake Panel */}
        <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-50 p-2">
                <Droplets className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Water Intake</h2>
                <p className="text-xs text-gray-500">Patient-logged hydration</p>
              </div>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {waterLogs.length} logs
            </span>
          </div>

          {waterLogs.length > 0 ? (
            <>
              {/* Today's summary */}
              <div className="mb-4 rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-700">Today&apos;s Total</p>
                <p className="text-3xl font-bold text-blue-900">{waterMeta?.todayTotal || 0} oz</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-200">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(((waterMeta?.todayTotal || 0) / 64) * 100, 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-blue-600">Goal: 64 oz</p>
              </div>

              {/* Recent logs */}
              <div className="space-y-2">
                {waterLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div className="flex items-center gap-2">
                      <Droplets className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-gray-700">
                        {format(new Date(log.recordedAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {log.amount} {log.unit}
                      </span>
                      <SourceBadge source={log.source} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-gray-50 py-8 text-center">
              <Droplets className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500">No water intake logged</p>
              <p className="mt-1 text-xs text-gray-400">Patient can log from their portal</p>
            </div>
          )}
        </div>

        {/* Sleep Panel */}
        <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-indigo-50 p-2">
                <Moon className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Sleep</h2>
                <p className="text-xs text-gray-500">Patient-logged sleep data</p>
              </div>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              {sleepLogs.length} logs
            </span>
          </div>

          {sleepLogs.length > 0 ? (
            <>
              {/* Weekly average */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-indigo-50 p-4">
                  <p className="text-xs text-indigo-600">Avg Sleep</p>
                  <p className="text-2xl font-bold text-indigo-900">
                    {sleepMeta?.avgSleepHours || 0}h
                  </p>
                  <p className="text-xs text-indigo-500">per night (7d)</p>
                </div>
                <div className="rounded-lg bg-indigo-50 p-4">
                  <p className="text-xs text-indigo-600">Avg Quality</p>
                  <p className="text-2xl font-bold text-indigo-900">
                    {sleepMeta?.avgQuality != null ? `${sleepMeta.avgQuality}/10` : '--'}
                  </p>
                  <p className="text-xs text-indigo-500">self-reported</p>
                </div>
              </div>

              {/* Recent sleep logs */}
              <div className="space-y-2">
                {sleepLogs.slice(0, 5).map((log) => {
                  const hrs = Math.floor(log.duration / 60);
                  const mins = log.duration % 60;
                  return (
                    <div key={log.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center gap-2">
                        <Moon className="h-4 w-4 text-indigo-400" />
                        <span className="text-sm text-gray-700">
                          {format(new Date(log.recordedAt), 'MMM d')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-900">
                          {hrs}h {mins > 0 ? `${mins}m` : ''}
                        </span>
                        {log.quality != null && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                            {log.quality}/10
                          </span>
                        )}
                        <SourceBadge source={log.source} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-gray-50 py-8 text-center">
              <Moon className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500">No sleep data logged</p>
              <p className="mt-1 text-xs text-gray-400">Patient can log from their portal</p>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* Exercise + Nutrition – side by side                                */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Exercise Panel */}
        <div className="rounded-xl border border-orange-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-orange-50 p-2">
                <Dumbbell className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Exercise</h2>
                <p className="text-xs text-gray-500">Patient-logged activity</p>
              </div>
            </div>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
              {exerciseLogs.length} logs
            </span>
          </div>

          {exerciseLogs.length > 0 ? (
            <>
              {/* Weekly stats */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-orange-50 p-4">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-orange-500" />
                    <p className="text-xs text-orange-600">This Week</p>
                  </div>
                  <p className="text-2xl font-bold text-orange-900">
                    {exerciseMeta?.weeklyMinutes || 0}
                  </p>
                  <p className="text-xs text-orange-500">minutes</p>
                </div>
                <div className="rounded-lg bg-orange-50 p-4">
                  <div className="flex items-center gap-1">
                    <Flame className="h-3 w-3 text-orange-500" />
                    <p className="text-xs text-orange-600">Calories</p>
                  </div>
                  <p className="text-2xl font-bold text-orange-900">
                    {exerciseMeta?.weeklyCalories || 0}
                  </p>
                  <p className="text-xs text-orange-500">burned (7d)</p>
                </div>
              </div>

              {/* Recent exercise logs */}
              <div className="space-y-2">
                {exerciseLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div className="flex items-center gap-2">
                      <Dumbbell className="h-4 w-4 text-orange-400" />
                      <div>
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {log.activityType}
                        </span>
                        <p className="text-xs text-gray-500">
                          {format(new Date(log.recordedAt), 'MMM d')} · {log.duration} min ·{' '}
                          <span className="capitalize">{log.intensity}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.calories != null && (
                        <span className="text-xs text-gray-500">{log.calories} cal</span>
                      )}
                      {log.steps != null && (
                        <span className="flex items-center gap-0.5 text-xs text-gray-500">
                          <Footprints className="h-3 w-3" />
                          {log.steps.toLocaleString()}
                        </span>
                      )}
                      <SourceBadge source={log.source} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-gray-50 py-8 text-center">
              <Dumbbell className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500">No exercise logged</p>
              <p className="mt-1 text-xs text-gray-400">Patient can log from their portal</p>
            </div>
          )}
        </div>

        {/* Nutrition Panel */}
        <div className="rounded-xl border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 p-2">
                <Utensils className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Nutrition</h2>
                <p className="text-xs text-gray-500">Patient-logged meals</p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {nutritionLogs.length} logs
            </span>
          </div>

          {nutritionLogs.length > 0 ? (
            <>
              {/* Today's macros */}
              <div className="mb-4 rounded-lg bg-emerald-50 p-4">
                <p className="mb-2 text-xs font-medium text-emerald-600">Today&apos;s Intake</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald-900">
                      {nutritionMeta?.todayCalories || 0}
                    </p>
                    <p className="text-xs text-emerald-600">cal</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-900">
                      {nutritionMeta?.todayProtein || 0}g
                    </p>
                    <p className="text-xs text-emerald-600">protein</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-900">
                      {nutritionMeta?.todayCarbs || 0}g
                    </p>
                    <p className="text-xs text-emerald-600">carbs</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-900">
                      {nutritionMeta?.todayFat || 0}g
                    </p>
                    <p className="text-xs text-emerald-600">fat</p>
                  </div>
                </div>
              </div>

              {/* Recent meals */}
              <div className="space-y-2">
                {nutritionLogs.slice(0, 5).map((log) => {
                  const mealIcons: Record<string, string> = {
                    breakfast: '🌅',
                    lunch: '☀️',
                    dinner: '🌙',
                    snack: '🍎',
                  };
                  return (
                    <div key={log.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{mealIcons[log.mealType] || '🍽️'}</span>
                        <div>
                          <span className="text-sm font-medium capitalize text-gray-900">
                            {log.mealType}
                          </span>
                          {log.description && (
                            <p className="max-w-[180px] truncate text-xs text-gray-500">
                              {log.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          {log.calories != null && (
                            <span className="text-sm font-semibold text-gray-900">
                              {log.calories} cal
                            </span>
                          )}
                          <p className="text-xs text-gray-500">
                            {format(new Date(log.recordedAt), 'MMM d')}
                          </p>
                        </div>
                        <SourceBadge source={log.source} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-gray-50 py-8 text-center">
              <Utensils className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500">No nutrition logged</p>
              <p className="mt-1 text-xs text-gray-400">Patient can log from their portal</p>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* Medication Reminders                                               */}
      {/* ================================================================== */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Medication Reminders</h2>
          <span className="text-sm text-gray-500">Patient-Configured</span>
        </div>

        {medicationReminders.length > 0 ? (
          <div className="space-y-2">
            <p className="mb-2 text-sm text-gray-600">Active reminders from patient dashboard:</p>
            {medicationReminders.map((reminder: any) => {
              const dayNames = [
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
              ];
              return (
                <div
                  key={reminder.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                >
                  <div>
                    <span className="text-sm font-medium">{reminder.medicationName}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      - Every {dayNames[reminder.dayOfWeek]} at {reminder.timeOfDay}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      reminder.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {reminder.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 py-8 text-center">
            <Calendar className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <p className="text-sm text-gray-500">No medication reminders set</p>
            <p className="mt-1 text-xs text-gray-400">
              Patient can configure reminders from their dashboard
            </p>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Educational Resources                                              */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Dietary Plans */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Dietary Plans</h2>
          <div className="space-y-3">
            <a
              href="#"
              className="block rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Week 1-4: Getting Started</p>
                  <p className="text-xs text-gray-500">1200-1500 calories/day</p>
                </div>
                <FileText className="h-4 w-4 text-gray-400" />
              </div>
            </a>
            <a
              href="#"
              className="block rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Week 5-8: Building Habits</p>
                  <p className="text-xs text-gray-500">1400-1700 calories/day</p>
                </div>
                <FileText className="h-4 w-4 text-gray-400" />
              </div>
            </a>
          </div>
        </div>

        {/* Tutorial Videos */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Tutorial Videos</h2>
          <div className="space-y-3">
            <button className="w-full rounded-lg bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">How to Inject Semaglutide</p>
                  <p className="text-xs text-gray-500">5 min video</p>
                </div>
                <Play className="h-4 w-4 text-gray-400" />
              </div>
            </button>
            <button className="w-full rounded-lg bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Exercise Routines for Beginners</p>
                  <p className="text-xs text-gray-500">15 min video</p>
                </div>
                <Play className="h-4 w-4 text-gray-400" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
