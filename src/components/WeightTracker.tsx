'use client';

import { useState, useEffect, useMemo } from 'react';
import { logger } from '../lib/logger';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import { safeParseJson, safeParseJsonString } from '@/lib/utils/safe-json';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { getPatientPortalTranslation } from '@/lib/i18n/patient-portal';
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
import { TrendingDown, TrendingUp, Scale, Target, Sparkles, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { toast } from '@/components/Toast';

// Register Chart.js components
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

interface WeightEntry {
  dateInput: string;
  currentWeightInput: number;
  id?: string;
}

/** Log shape from API / parent (progress page) — single source of truth when provided */
export interface WeightLogFromParent {
  id: number;
  recordedAt: string;
  weight: number;
}

interface WeightTrackerProps {
  patientId?: number;
  embedded?: boolean;
  variant?: 'default' | 'hims';
  accentColor?: string;
  showBMI?: boolean;
  heightInches?: number;
  onWeightSaved?: () => void;
  /** When true, use patient portal i18n (usePatientPortalLanguage) for all labels */
  usePortalI18n?: boolean;
  /** When true, use portalFetch for GET/POST so auth matches rest of patient portal (fixes save/display in portal) */
  usePortalFetch?: boolean;
  /**
   * Enterprise: when provided, this is the SINGLE source of truth for display.
   * No internal GET — parent (e.g. progress page) owns the data and refetches after save.
   * Eliminates duplicate fetches and refresh/navigate display bugs.
   */
  weightLogsFromParent?: WeightLogFromParent[] | null;
}

const calculateBMI = (weightLbs: number, heightInches: number): number => {
  return (weightLbs / (heightInches * heightInches)) * 703;
};

const getBMICategoryKey = (bmi: number): string => {
  if (bmi < 18.5) return 'weightTrackerBMIUnderweight';
  if (bmi < 25) return 'weightTrackerBMIHealthy';
  if (bmi < 30) return 'weightTrackerBMIOverweight';
  return 'weightTrackerBMIObese';
};

const getBMICategory = (bmi: number): { label: string; color: string; bgColor: string } => {
  if (bmi < 18.5) return { label: 'Underweight', color: '#3B82F6', bgColor: '#EFF6FF' };
  if (bmi < 25) return { label: 'Healthy', color: '#10B981', bgColor: '#ECFDF5' };
  if (bmi < 30) return { label: 'Overweight', color: '#F59E0B', bgColor: '#FFFBEB' };
  return { label: 'Obese', color: '#EF4444', bgColor: '#FEF2F2' };
};

function getHeroTextColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? 'dark' : 'light';
}

export default function WeightTracker({
  patientId,
  embedded = false,
  variant = 'hims',
  accentColor = '#d3f931',
  showBMI = true,
  heightInches = 70,
  onWeightSaved,
  usePortalI18n = false,
  usePortalFetch = false,
  weightLogsFromParent,
}: WeightTrackerProps) {
  const heroTheme = getHeroTextColor(accentColor);
  const { t: tPortal } = usePatientPortalLanguage();
  const t = usePortalI18n ? tPortal : (key: string) => getPatientPortalTranslation('en', key);
  const [currentWeight, setCurrentWeight] = useState('');
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Enterprise: when parent provides weight logs, use them as the ONLY source of truth — no internal GET
  const controlledData = useMemo(() => {
    if (weightLogsFromParent == null) return null;
    const arr = Array.isArray(weightLogsFromParent) ? weightLogsFromParent : [];
    return arr.map((log) => ({
      dateInput: log.recordedAt,
      currentWeightInput: log.weight,
      id: String(log.id),
    }));
  }, [weightLogsFromParent]);

  const displayData = controlledData !== null ? controlledData : weightData;

  // Only fetch when NOT controlled by parent (e.g. admin/standalone use)
  useEffect(() => {
    if (controlledData !== null) return;
    const loadWeightData = async () => {
      if (patientId) {
        try {
          const response = usePortalFetch
            ? await portalFetch(`/api/patient-progress/weight?patientId=${patientId}`, {
                cache: 'no-store',
              })
            : await apiFetch(`/api/patient-progress/weight?patientId=${patientId}`, {
                headers: getAuthHeaders(),
                credentials: 'include',
                cache: 'no-store',
              });
          if (response.ok) {
            const result = await safeParseJson(response);
            const rawLogs = Array.isArray(result) ? result : (result && typeof result === 'object' && 'data' in result ? (result as { data?: unknown[] }).data : null) ?? [];
            const formattedData = rawLogs.map((log: { recordedAt?: string; weight?: number; id?: number }) => ({
              dateInput: log.recordedAt ?? '',
              currentWeightInput: Number(log.weight) || 0,
              id: log.id != null ? String(log.id) : '',
            }));
            setWeightData(formattedData);
            localStorage.setItem(`weightData_${patientId}`, JSON.stringify(formattedData));
          } else if ((response.status === 401 || response.status === 403) && !usePortalFetch) {
            const stored = localStorage.getItem(`weightData_${patientId}`);
            const parsed = safeParseJsonString<WeightEntry[]>(stored);
            if (parsed && Array.isArray(parsed)) setWeightData(parsed);
          }
        } catch (error) {
          logger.error('Failed to fetch weight data', { error: error instanceof Error ? error.message : 'Unknown' });
          const stored = localStorage.getItem(`weightData_${patientId}`);
          const parsed = safeParseJsonString<WeightEntry[]>(stored);
          if (parsed && Array.isArray(parsed)) setWeightData(parsed);
        }
      } else {
        const stored = localStorage.getItem(`weightData_default`);
        const parsed = safeParseJsonString<WeightEntry[]>(stored);
        if (parsed && Array.isArray(parsed)) setWeightData(parsed);
      }
    };
    loadWeightData();
  }, [patientId, usePortalFetch, controlledData]);

  const handleWeightSubmit = async () => {
    const trimmed = currentWeight.trim();
    const parsed = Number(trimmed);
    if (!trimmed || isNaN(parsed) || parsed <= 0) {
      setSaveError('Please enter a valid weight');
      toast.error('Please enter a valid weight');
      return;
    }

    setIsLoading(true);
    const newEntry: WeightEntry = {
      dateInput: new Date().toISOString(),
      currentWeightInput: parsed,
      id: Date.now().toString(),
    };

    setSaveError(null);
    try {
      if (patientId) {
        const body = {
          patientId,
          weight: parsed,
          unit: 'lbs',
          recordedAt: new Date().toISOString(),
        };
        const response = usePortalFetch
          ? await portalFetch('/api/patient-progress/weight', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await apiFetch('/api/patient-progress/weight', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              credentials: 'include',
              body: JSON.stringify(body),
            });

        if (response.ok) {
          const savedLog = await safeParseJson(response);
          const id = savedLog && typeof savedLog === 'object' && 'id' in savedLog ? (savedLog as { id: number }).id : null;
          if (id != null) newEntry.id = String(id);
          if (weightLogsFromParent == null) setWeightData((prev) => [...prev, newEntry]);
        } else {
          const errBody = await safeParseJson(response);
          const msg = errBody && typeof errBody === 'object' && 'error' in errBody && typeof (errBody as { error: unknown }).error === 'string' ? (errBody as { error: string }).error : 'Failed to save weight';
          throw new Error(msg);
        }
      } else {
        const updatedData = [...weightData, newEntry];
        setWeightData(updatedData);
        localStorage.setItem(`weightData_default`, JSON.stringify(updatedData));
      }

      setCurrentWeight('');
      setShowSuccess(true);
      toast.success(`Weight logged: ${parsed} lbs`);
      setTimeout(() => setShowSuccess(false), 2500);
      if (onWeightSaved) onWeightSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save weight';
      logger.error('Failed to save weight', { error: error instanceof Error ? error.message : 'Unknown' });
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const sortedData = useMemo(
    () =>
      [...displayData].sort(
        (a, b) => new Date(a.dateInput).getTime() - new Date(b.dateInput).getTime()
      ),
    [displayData]
  );

  const chartData = sortedData.slice(-7);
  const chartLabels = chartData.map((w) =>
    new Date(w.dateInput).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const chartWeights = chartData.map((w) => w.currentWeightInput);

  const latestWeight = sortedData[sortedData.length - 1]?.currentWeightInput;
  const startingWeight = sortedData[0]?.currentWeightInput;
  const weightChange = latestWeight && startingWeight ? latestWeight - startingWeight : 0;
  const percentChange = startingWeight ? Math.abs((weightChange / startingWeight) * 100) : 0;

  const currentBMI = latestWeight ? calculateBMI(latestWeight, heightInches) : null;
  const bmiCategory = currentBMI ? getBMICategory(currentBMI) : null;

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a1a',
        titleColor: '#fff',
        bodyColor: '#fff',
        titleFont: { family: 'system-ui', weight: 'bold', size: 13 },
        bodyFont: { family: 'system-ui', size: 14 },
        padding: 14,
        cornerRadius: 12,
        displayColors: false,
        callbacks: {
          title: (items) => items[0]?.label || '',
          label: (context) => `${context.raw} lbs`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          font: { family: 'system-ui', size: 11, weight: 500 },
          color: '#9CA3AF',
        },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: {
          font: { family: 'system-ui', size: 11, weight: 500 },
          color: '#9CA3AF',
          padding: 12,
        },
        grid: {
          color: '#F3F4F6',
          drawTicks: false,
        },
        border: { display: false },
        beginAtZero: false,
      },
    },
  };

  const data = {
    labels: chartLabels,
    datasets: [
      {
        data: chartWeights,
        borderColor: accentColor,
        pointBackgroundColor: accentColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 3,
        pointRadius: 6,
        pointHoverRadius: 10,
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 250);
          gradient.addColorStop(0, `${accentColor}50`);
          gradient.addColorStop(0.5, `${accentColor}20`);
          gradient.addColorStop(1, `${accentColor}00`);
          return gradient;
        },
      },
    ],
  };

  if (embedded) {
    return (
      <div className="h-32 w-full">
        {chartData.length > 0 ? (
          <Line
            data={data}
            options={{
              ...chartOptions,
              scales: { x: { display: false }, y: { display: false } },
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            No data yet
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-white shadow-lg shadow-gray-200/40 md:rounded-3xl md:shadow-xl md:shadow-gray-200/50">
      {/* Hero Header - compact on mobile for native iPhone fit */}
      <div
        className="relative overflow-hidden px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6 md:px-8 md:pb-8 md:pt-10"
        style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)` }}
      >
        <div
          className="absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-20 md:-right-16 md:-top-16 md:h-64 md:w-64"
          style={{ backgroundColor: '#000' }}
        />
        <div
          className="absolute -bottom-12 -left-12 h-32 w-32 rounded-full opacity-10 md:-bottom-20 md:-left-20 md:h-48 md:w-48"
          style={{ backgroundColor: '#fff' }}
        />

        <div className="relative">
          <div className="mb-0.5 flex items-center gap-2 sm:mb-1">
            <Scale className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${heroTheme === 'light' ? 'text-white/60' : 'text-gray-700/60'}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider sm:text-xs ${heroTheme === 'light' ? 'text-white/60' : 'text-gray-700/60'}`}>
              {t('weightTrackerCurrentWeight')}
            </span>
          </div>

          <div className="flex items-end justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
              <span className={`text-4xl font-semibold tracking-tight sm:text-5xl md:text-7xl ${heroTheme === 'light' ? 'text-white' : 'text-gray-900'}`}>
                {latestWeight || '---'}
              </span>
              <span className={`mb-1 text-lg font-medium sm:mb-2 sm:text-2xl ${heroTheme === 'light' ? 'text-white/70' : 'text-gray-700/70'}`}>
                {t('weightTrackerLbs')}
              </span>
            </div>

            {weightChange !== 0 && (
              <div
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 backdrop-blur-sm sm:gap-2 sm:rounded-2xl sm:px-5 sm:py-3 ${
                  heroTheme === 'light'
                    ? 'bg-white/20'
                    : weightChange < 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'
                }`}
              >
                {weightChange < 0 ? (
                  <TrendingDown className={`h-4 w-4 sm:h-5 sm:w-5 ${heroTheme === 'light' ? 'text-white' : 'text-emerald-700'}`} />
                ) : (
                  <TrendingUp className={`h-4 w-4 sm:h-5 sm:w-5 ${heroTheme === 'light' ? 'text-white' : 'text-rose-700'}`} />
                )}
                <span
                  className={`text-sm font-semibold sm:text-lg ${
                    heroTheme === 'light'
                      ? 'text-white'
                      : weightChange < 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {Math.abs(weightChange).toFixed(1)} {t('weightTrackerLbs')}
                </span>
              </div>
            )}
          </div>

          {/* BMI Badge - single row, smaller on mobile */}
          {showBMI && currentBMI && bmiCategory && (
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 md:mt-6 md:gap-3">
              <div className={`rounded-lg px-3 py-1.5 backdrop-blur-sm sm:rounded-xl sm:px-4 sm:py-2 ${heroTheme === 'light' ? 'bg-white/20' : 'bg-black/10'}`}>
                <span className={`text-xs font-semibold sm:text-sm ${heroTheme === 'light' ? 'text-white' : 'text-gray-800'}`}>
                  BMI {currentBMI.toFixed(1)}
                </span>
              </div>
              <div
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2"
                style={{ backgroundColor: bmiCategory.bgColor }}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2"
                  style={{ backgroundColor: bmiCategory.color }}
                />
                <span
                  className="text-xs font-semibold sm:text-sm"
                  style={{ color: bmiCategory.color }}
                >
                  {usePortalI18n ? t(getBMICategoryKey(currentBMI)) : bmiCategory.label}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Weight Input Section - 44px+ touch targets on mobile */}
      <div className="border-b border-gray-100 p-4 sm:p-5 md:p-8">
        <div className="mb-3 flex items-center gap-2 sm:mb-4">
          <Sparkles className="h-3.5 w-3.5 text-gray-400 sm:h-4 sm:w-4" />
          <span className="text-xs font-semibold text-gray-500 sm:text-sm">
            {t('weightTrackerLogToday')}
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleWeightSubmit();
          }}
          className="flex flex-col gap-3 sm:flex-row sm:gap-4"
        >
          <div
            className={`relative flex-1 transition-all duration-300 ${isFocused ? 'scale-[1.01]' : ''}`}
          >
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={currentWeight}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '');
                setCurrentWeight(val);
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={t('weightTrackerEnterWeight')}
              className={`min-h-[48px] w-full rounded-xl border-2 bg-gray-50 px-4 py-3 text-lg font-semibold text-gray-900 outline-none transition-all placeholder:font-normal placeholder:text-gray-400 sm:min-h-0 sm:rounded-2xl sm:px-5 sm:py-4 sm:text-xl md:px-6 md:py-5 ${
                isFocused ? 'border-gray-900 bg-white shadow-lg' : 'border-transparent'
              }`}
              style={{ fontSize: '16px' }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400 sm:right-5 sm:text-base md:right-6 md:text-lg">
              {t('weightTrackerLbs')}
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading || !currentWeight.trim()}
            className={`group relative min-h-[48px] overflow-hidden rounded-xl px-6 py-3 font-semibold transition-all duration-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[52px] sm:rounded-2xl sm:px-8 sm:py-4 md:px-10 md:py-5 md:hover:scale-105 md:hover:shadow-xl ${heroTheme === 'light' ? 'text-white' : 'text-gray-900'}`}
            style={{ backgroundColor: accentColor }}
          >
            <span className="absolute inset-0 translate-y-full bg-black/10 transition-transform duration-300 group-hover:translate-y-0" />
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className={`h-5 w-5 animate-spin rounded-full border-2 border-t-transparent ${heroTheme === 'light' ? 'border-white' : 'border-gray-900'}`} />
                <span className="relative">{t('weightTrackerSaving')}</span>
              </div>
            ) : showSuccess ? (
              <div className="flex items-center justify-center gap-2">
                <Check className="h-5 w-5" />
                <span className="relative">{t('weightTrackerSaved')}</span>
              </div>
            ) : (
              <span className="relative">{t('weightTrackerLogWeight')}</span>
            )}
          </button>
          {saveError && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {saveError}
            </p>
          )}
        </form>
      </div>

      {/* Chart Section - shorter on mobile to fit viewport */}
      <div className="w-full min-w-0 p-4 sm:p-6 md:p-8">
        <div className="mb-3 flex items-center justify-between gap-2 sm:mb-6">
          <div>
            <h3 className="text-base font-semibold text-gray-900 sm:text-xl">
              {t('weightTrackerYourProgress')}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 sm:mt-1 sm:text-sm">
              {t('weightTrackerLast7')}
            </p>
          </div>
          {percentChange > 0 && weightChange !== 0 && (
            <div className="text-right">
              <span
                className={`text-lg font-semibold sm:text-2xl ${weightChange < 0 ? 'text-emerald-500' : 'text-rose-500'}`}
              >
                {weightChange < 0 ? '-' : '+'}
                {percentChange.toFixed(1)}%
              </span>
              <p className="text-[10px] text-gray-500 sm:text-xs">{t('weightTrackerSinceStart')}</p>
            </div>
          )}
        </div>

        <div className="relative h-48 min-h-[120px] w-full sm:h-56 md:h-64 lg:h-72">
          {chartData.length > 0 ? (
            <div className="absolute inset-0 w-full">
              <Line data={data} options={chartOptions} />
            </div>
          ) : (
            <div className="flex h-full min-h-[120px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-100/80 px-4 py-6 sm:rounded-2xl">
              <Scale className="mb-2 h-10 w-10 shrink-0 text-gray-500 sm:mb-3 sm:h-12 sm:w-12" />
              <p className="text-center text-sm font-semibold text-gray-600 sm:text-base">
                {t('weightTrackerNoDataYet')}
              </p>
              <p className="mt-1 text-center text-xs text-gray-500 sm:mt-1.5 sm:text-sm">
                {t('weightTrackerLogFirstWeight')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Footer - 2x2 grid on mobile to avoid tiny text */}
      {sortedData.length > 1 && (
        <div className="grid grid-cols-2 gap-px border-t border-gray-100 bg-gray-100 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-gray-100">
          {[
            {
              labelKey: 'weightTrackerStatStarting',
              value: `${startingWeight}`,
              unitKey: 'weightTrackerLbs',
              color: 'text-gray-600',
            },
            {
              labelKey: 'weightTrackerStatCurrent',
              value: `${latestWeight}`,
              unitKey: 'weightTrackerLbs',
              color: 'text-gray-900',
            },
            {
              labelKey: 'weightTrackerStatChange',
              value: `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)}`,
              unitKey: 'weightTrackerLbs',
              color: weightChange < 0 ? 'text-emerald-600' : 'text-rose-600',
            },
            {
              labelKey: 'weightTrackerStatCheckins',
              value: `${displayData.length}`,
              unitKey: 'weightTrackerStatTotal',
              color: 'text-gray-900',
            },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-50/50 px-3 py-3 text-center sm:px-6 sm:py-5">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:mb-1 sm:text-xs">
                {t(stat.labelKey)}
              </p>
              <p className={`text-lg font-semibold sm:text-2xl ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-gray-400 sm:text-xs">{t(stat.unitKey)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
