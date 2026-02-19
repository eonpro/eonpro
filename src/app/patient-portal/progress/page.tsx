'use client';

import { useState, useEffect, useMemo } from 'react';
import { useClinicBranding, usePortalFeatures } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson, safeParseJsonString } from '@/lib/utils/safe-json';
import { getEnabledProgressTabIds } from '@/lib/patient-portal';
import { logger } from '@/lib/logger';
import { getMinimalPortalUserPayload, setPortalUserStorage } from '@/lib/utils/portal-user-storage';
import { toast } from '@/components/Toast';
import WeightTracker from '@/components/WeightTracker';
import {
  Scale,
  Droplets,
  Footprints,
  Moon,
  Utensils,
  TrendingDown,
  TrendingUp,
  Activity,
  Target,
  Calendar,
  Award,
  Flame,
  Plus,
  Check,
  Clock,
  Dumbbell,
  Apple,
  Coffee,
  Sun,
  Sunset,
  Camera,
} from 'lucide-react';
import Link from 'next/link';

interface WeightLog {
  id: number;
  recordedAt: string;
  weight: number;
}

type TabType = 'weight' | 'water' | 'exercise' | 'sleep' | 'nutrition';

/** Tab display metadata (labelKey/icon); visibility driven by registry + clinic features */
const TAB_META: Record<TabType, { labelKey: string; icon: typeof Scale }> = {
  weight: { labelKey: 'progressTabWeight', icon: Scale },
  water: { labelKey: 'progressTabWater', icon: Droplets },
  exercise: { labelKey: 'progressTabExercise', icon: Footprints },
  sleep: { labelKey: 'progressTabSleep', icon: Moon },
  nutrition: { labelKey: 'progressTabNutrition', icon: Utensils },
};

const exerciseTypes = [
  { value: 'walking', label: 'Walking', icon: '🚶' },
  { value: 'running', label: 'Running', icon: '🏃' },
  { value: 'cycling', label: 'Cycling', icon: '🚴' },
  { value: 'swimming', label: 'Swimming', icon: '🏊' },
  { value: 'strength', label: 'Strength', icon: '💪' },
  { value: 'yoga', label: 'Yoga', icon: '🧘' },
  { value: 'hiit', label: 'HIIT', icon: '⚡' },
  { value: 'other', label: 'Other', icon: '🎯' },
];

const mealTypes = [
  { value: 'breakfast', label: 'Breakfast', icon: Coffee },
  { value: 'lunch', label: 'Lunch', icon: Sun },
  { value: 'dinner', label: 'Dinner', icon: Sunset },
  { value: 'snack', label: 'Snack', icon: Apple },
];

export default function ProgressPage() {
  const { branding } = useClinicBranding();
  const features = usePortalFeatures();
  const { t } = usePatientPortalLanguage();
  const accentColor = branding?.accentColor || '#d3f931';
  const primaryColor = branding?.primaryColor || '#4fa77e';

  // Tabs driven by clinic feature flags and treatment (registry); fallback to weight if none enabled
  const tabs = useMemo(() => {
    const enabledIds = getEnabledProgressTabIds(features, branding?.primaryTreatment);
    const ids = enabledIds.length > 0 ? enabledIds : (['weight'] as TabType[]);
    return ids.map((id) => ({ id, ...TAB_META[id] }));
  }, [features, branding?.primaryTreatment]);

  const [patientId, setPatientId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('weight');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState('');

  // Keep activeTab in sync with enabled tabs (e.g. clinic disables current tab)
  useEffect(() => {
    const enabledIds = tabs.map((tab) => tab.id);
    if (enabledIds.length > 0 && !enabledIds.includes(activeTab)) {
      setActiveTab(enabledIds[0]);
    }
  }, [tabs, activeTab]);

  // Weight state
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);

  // Water state
  const [waterAmount, setWaterAmount] = useState('');
  const [todayWater, setTodayWater] = useState(0);
  const waterGoal = 64; // 64 oz default goal

  // Exercise state
  const [exerciseType, setExerciseType] = useState('walking');
  const [exerciseDuration, setExerciseDuration] = useState('');
  const [exerciseIntensity, setExerciseIntensity] = useState('moderate');
  const [weeklyMinutes, setWeeklyMinutes] = useState(0);

  // Sleep state
  const [sleepStart, setSleepStart] = useState('22:00');
  const [sleepEnd, setSleepEnd] = useState('06:00');
  const [sleepQuality, setSleepQuality] = useState(7);
  const [avgSleepHours, setAvgSleepHours] = useState(0);

  // Nutrition state
  const [mealType, setMealType] = useState('breakfast');
  const [mealDescription, setMealDescription] = useState('');
  const [mealCalories, setMealCalories] = useState('');
  const [todayCalories, setTodayCalories] = useState(0);

  // Enterprise: single resolution of patientId — never show progress content without it (or clear error)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        let userData: { role?: string; patientId?: number; [k: string]: unknown } | null = null;
        const userJson = localStorage.getItem('user');
        if (userJson) {
          userData = safeParseJsonString<{ role?: string; patientId?: number; [k: string]: unknown }>(userJson);
        }

        let pid: number | null = userData?.patientId ?? null;

        // If we're a patient and missing patientId, or we have no user at all, call /api/auth/me (token may be in cookie or localStorage)
        if ((!userData || (userData.role?.toLowerCase() === 'patient' && pid == null))) {
          const meRes = await portalFetch('/api/auth/me', { cache: 'no-store' });
          if (meRes.ok) {
            const meData = await safeParseJson(meRes);
            const me = (meData as { user?: { id?: number; role?: string; patientId?: number; email?: string; [k: string]: unknown } } | null)?.user;
            if (me && !cancelled) {
              const fromMePid = typeof me.patientId === 'number' && me.patientId > 0 ? me.patientId : null;
              pid = fromMePid;
              const toStore: { id?: number; role?: string; patientId?: number } = userData
                ? { ...userData, patientId: fromMePid ?? userData.patientId }
                : { id: me.id, role: me.role, patientId: fromMePid ?? undefined };
              setPortalUserStorage(getMinimalPortalUserPayload(toStore));
            }
          }
          if (!userData && !meRes.ok && !cancelled) {
            setError('Please log in to view your progress.');
            setLoading(false);
            return;
          }
        }

        if (!cancelled) {
          setPatientId(pid);
          if (userData?.role?.toLowerCase() === 'patient' && pid == null) {
            setError('Unable to load your profile. Please log out and log in again.');
          }
        }
      } catch {
        if (!cancelled) {
          setPatientId(null);
          setError('Failed to load your session. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (patientId) {
      fetchData();
    }
  }, [patientId, activeTab]);

  const fetchData = async () => {
    if (!patientId) return;
    try {
      setError(null);
      const opts = { cache: 'no-store' as RequestCache };
      if (activeTab === 'weight') {
        const response = await portalFetch(`/api/patient-progress/weight?patientId=${patientId}`, opts);
        if (response.status === 401) {
          setError('Your session has expired. Please log in again.');
          return;
        }
        if (response.ok) {
          const result = await safeParseJson(response);
          const logs = Array.isArray(result) ? result : (result && typeof result === 'object' && 'data' in result ? (result as { data?: WeightLog[] }).data : null) || [];
          setWeightLogs(logs);
        }
      } else if (activeTab === 'water') {
        const response = await portalFetch(`/api/patient-progress/water?patientId=${patientId}`, opts);
        if (response.status === 401) {
          setError('Your session has expired. Please log in again.');
          return;
        }
        if (response.ok) {
          const result = await safeParseJson(response);
          setTodayWater((result as { meta?: { todayTotal?: number } } | null)?.meta?.todayTotal || 0);
        } else {
          logger.error('Failed to fetch water data', { status: response.status });
          setError('Could not load water data. Please try again.');
        }
      } else if (activeTab === 'exercise') {
        const response = await portalFetch(`/api/patient-progress/exercise?patientId=${patientId}`, opts);
        if (response.status === 401) {
          setError('Your session has expired. Please log in again.');
          return;
        }
        if (response.ok) {
          const result = await safeParseJson(response);
          setWeeklyMinutes((result as { meta?: { weeklyMinutes?: number } } | null)?.meta?.weeklyMinutes || 0);
        } else {
          logger.error('Failed to fetch exercise data', { status: response.status });
          setError('Could not load exercise data. Please try again.');
        }
      } else if (activeTab === 'sleep') {
        const response = await portalFetch(`/api/patient-progress/sleep?patientId=${patientId}`, opts);
        if (response.status === 401) {
          setError('Your session has expired. Please log in again.');
          return;
        }
        if (response.ok) {
          const result = await safeParseJson(response);
          setAvgSleepHours((result as { meta?: { avgSleepHours?: number } } | null)?.meta?.avgSleepHours || 0);
        } else {
          logger.error('Failed to fetch sleep data', { status: response.status });
          setError('Could not load sleep data. Please try again.');
        }
      } else if (activeTab === 'nutrition') {
        const response = await portalFetch(`/api/patient-progress/nutrition?patientId=${patientId}`, opts);
        if (response.status === 401) {
          setError('Your session has expired. Please log in again.');
          return;
        }
        if (response.ok) {
          const result = await safeParseJson(response);
          setTodayCalories((result as { meta?: { todayCalories?: number } } | null)?.meta?.todayCalories || 0);
        } else {
          logger.error('Failed to fetch nutrition data', { status: response.status });
          setError('Could not load nutrition data. Please try again.');
        }
      }
    } catch (error) {
      logger.error('Failed to fetch progress data', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setError('Failed to load health data. Please check your connection and try again.');
    }
  };

  const handleQuickWater = async (amount: number) => {
    if (!patientId) return;
    if (amount <= 0 || amount > 200) {
      setError('Water amount must be between 1 and 200 oz');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await portalFetch('/api/patient-progress/water', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, amount, unit: 'oz' }),
      });
      if (response.ok) {
        setTodayWater((prev) => prev + amount);
        setShowSuccess(`+${amount} oz added!`);
        toast.success(`+${amount} oz water logged`);
        setTimeout(() => setShowSuccess(''), 2000);
        fetchData();
      } else {
        const errBody = await safeParseJson(response);
        const errMessage =
          (errBody && typeof errBody === 'object' && 'error' in errBody && (errBody as { error?: string }).error) ||
          `Could not save water (${response.status}). Please try again.`;
        setError(String(errMessage));
        toast.error(String(errMessage));
      }
    } catch (error) {
      logger.error('Failed to log water', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setError('Failed to save water. Please check your connection and try again.');
      toast.error('Failed to save water');
    } finally {
      setSaving(false);
    }
  };

  const handleLogExercise = async () => {
    if (!patientId || !exerciseDuration) return;
    const duration = parseInt(exerciseDuration);
    if (isNaN(duration) || duration <= 0 || duration > 1440) {
      setError('Exercise duration must be between 1 and 1440 minutes');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await portalFetch('/api/patient-progress/exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          activityType: exerciseType,
          duration,
          intensity: exerciseIntensity,
        }),
      });
      if (response.ok) {
        setWeeklyMinutes((prev) => prev + duration);
        setExerciseDuration('');
        setExerciseType('walking');
        setExerciseIntensity('moderate');
        setShowSuccess('Exercise logged!');
        toast.success('Exercise logged!');
        setTimeout(() => setShowSuccess(''), 2000);
        fetchData();
      } else {
        const errBody = await safeParseJson(response);
        const errMsg = (errBody && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error?: string }).error)
            : 'Failed to save exercise');
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch (error) {
      logger.error('Failed to log exercise', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setError('Failed to save exercise. Please try again.');
      toast.error('Failed to save exercise');
    } finally {
      setSaving(false);
    }
  };

  const handleLogSleep = async () => {
    if (!patientId) return;
    if (!sleepStart || !sleepEnd) {
      setError('Please set both sleep start and end times');
      return;
    }
    const [startHour, startMin] = sleepStart.split(':').map(Number);
    const [endHour, endMin] = sleepEnd.split(':').map(Number);
    if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
      setError('Invalid time format');
      return;
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const sleepStartDate = new Date(yesterday);
    sleepStartDate.setHours(startHour, startMin, 0, 0);
    const sleepEndDate = new Date(today);
    sleepEndDate.setHours(endHour, endMin, 0, 0);

    const durationMs = sleepEndDate.getTime() - sleepStartDate.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    if (durationHours < 1 || durationHours > 24) {
      setError('Sleep duration must be between 1 and 24 hours');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await portalFetch('/api/patient-progress/sleep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          sleepStart: sleepStartDate.toISOString(),
          sleepEnd: sleepEndDate.toISOString(),
          quality: sleepQuality,
        }),
      });
      if (response.ok) {
        setSleepStart('22:00');
        setSleepEnd('06:00');
        setSleepQuality(7);
        setShowSuccess('Sleep logged!');
        toast.success('Sleep logged!');
        fetchData();
        setTimeout(() => setShowSuccess(''), 2000);
      } else {
        const errBody = await safeParseJson(response);
        const errMsg = (errBody && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error?: string }).error)
            : 'Failed to save sleep data');
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch (error) {
      logger.error('Failed to log sleep', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setError('Failed to save sleep data. Please try again.');
      toast.error('Failed to save sleep data');
    } finally {
      setSaving(false);
    }
  };

  const handleLogMeal = async () => {
    if (!patientId) return;
    if (mealCalories) {
      const cal = parseInt(mealCalories);
      if (isNaN(cal) || cal < 0 || cal > 10000) {
        setError('Calories must be between 0 and 10,000');
        return;
      }
    }
    if (!mealDescription.trim() && !mealCalories) {
      setError('Please add a description or calorie count for the meal');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await portalFetch('/api/patient-progress/nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          mealType,
          description: mealDescription.trim(),
          calories: mealCalories ? parseInt(mealCalories) : undefined,
        }),
      });
      if (response.ok) {
        if (mealCalories) {
          setTodayCalories((prev) => prev + parseInt(mealCalories));
        }
        setMealDescription('');
        setMealCalories('');
        setMealType('breakfast');
        setShowSuccess('Meal logged!');
        toast.success('Meal logged!');
        setTimeout(() => setShowSuccess(''), 2000);
        fetchData();
      } else {
        const errBody = await safeParseJson(response);
        const errMsg = (errBody && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error?: string }).error)
            : 'Failed to save meal');
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch (error) {
      logger.error('Failed to log meal', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setError('Failed to save meal. Please try again.');
      toast.error('Failed to save meal');
    } finally {
      setSaving(false);
    }
  };

  // Calculate weight stats
  const sortedLogs = [...weightLogs].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  const latestWeight = sortedLogs[sortedLogs.length - 1]?.weight;
  const startingWeight = sortedLogs[0]?.weight;
  const totalChange = latestWeight && startingWeight ? latestWeight - startingWeight : 0;

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

  if (error) {
    return (
      <div className="safe-left safe-right flex min-h-[50vh] items-center justify-center p-4">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-red-700">
          <Activity className="mx-auto mb-3 h-12 w-12 text-red-300" />
          <p className="mb-2 font-medium">{t('progressErrorLoading')}</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              if (patientId) fetchData();
            }}
            className="mt-4 min-h-[44px] rounded-xl bg-red-100 px-4 py-2 text-sm font-medium transition-colors hover:bg-red-200 active:scale-[0.98]"
          >
            {t('progressTryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="safe-left safe-right min-h-[100dvh] w-full min-w-0 max-w-full overflow-x-hidden px-4 py-4 pb-36 md:mx-auto md:max-w-2xl md:pb-6">
      {/* Success Toast - below status bar on mobile */}
      {showSuccess && (
        <div
          className="animate-in slide-in-from-top-2 fixed left-4 right-4 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 text-white shadow-2xl md:left-auto md:right-4 md:min-w-0"
          style={{ top: 'calc(56px + env(safe-area-inset-top, 0px) + 8px)' }}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-4 w-4" />
          </div>
          <span className="truncate font-medium">{showSuccess}</span>
        </div>
      )}

      {/* Header - compact on mobile for native feel */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">{t('progressTitle')}</h1>
        <p className="mt-0.5 text-sm text-gray-500">{t('progressSubtitle')}</p>
      </div>

      {/* Tab Navigation - Scrollable within viewport, no page overflow */}
      <div
        className="mb-4 w-full min-w-0 overflow-x-auto overflow-y-hidden"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex min-w-max gap-2 pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-xl px-4 py-2.5 font-medium transition-all active:scale-[0.98] ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-lg'
                    : 'bg-white text-gray-600 active:bg-gray-100'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="whitespace-nowrap text-sm">{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'weight' && (
        <div className="space-y-4 md:space-y-6">
          {/* Quick Stats - compact on mobile */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="rounded-xl bg-white p-3 shadow-sm sm:rounded-2xl sm:p-4">
              <div className="mb-1 flex items-center gap-2 sm:mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 sm:h-8 sm:w-8">
                  <Activity className="h-3.5 w-3.5 text-gray-500 sm:h-4 sm:w-4" />
                </div>
              </div>
              <p className="text-xl font-semibold text-gray-900 sm:text-2xl">
                {latestWeight || '--'}
              </p>
              <p className="text-xs font-medium text-gray-500">{t('progressCurrentLbs')}</p>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm sm:rounded-2xl sm:p-4">
              <div className="mb-1 flex items-center gap-2 sm:mb-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-lg sm:h-8 sm:w-8 ${
                    totalChange <= 0 ? 'bg-emerald-100' : 'bg-rose-100'
                  }`}
                >
                  {totalChange <= 0 ? (
                    <TrendingDown className="h-3.5 w-3.5 text-emerald-600 sm:h-4 sm:w-4" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5 text-rose-600 sm:h-4 sm:w-4" />
                  )}
                </div>
              </div>
              <p
                className={`text-xl font-semibold sm:text-2xl ${totalChange <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {totalChange > 0 ? '+' : ''}
                {totalChange.toFixed(1)}
              </p>
              <p className="text-xs font-medium text-gray-500">{t('progressChangeLbs')}</p>
            </div>
          </div>

          {/* Weight Tracker - mobile-optimized, uses portal i18n */}
          <WeightTracker
            patientId={patientId ?? undefined}
            variant="hims"
            accentColor={accentColor}
            showBMI={true}
            onWeightSaved={fetchData}
            usePortalI18n
            usePortalFetch
            weightLogsFromParent={weightLogs}
          />

          {/* Progress Photos Link - compact touch target */}
          <Link
            href="/patient-portal/photos/progress"
            className="flex min-h-[56px] items-center justify-between rounded-xl bg-white p-3 shadow-sm transition-shadow active:bg-gray-50 sm:rounded-2xl sm:p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <Camera className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: primaryColor }} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{t('progressPhotos')}</p>
                <p className="truncate text-xs text-gray-500 sm:text-sm">
                  {t('progressPhotosSubtitle')}
                </p>
              </div>
            </div>
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus className="h-4 w-4 text-white sm:h-5 sm:w-5" />
            </div>
          </Link>
        </div>
      )}

      {activeTab === 'water' && (
        <div className="space-y-6">
          {/* Water Progress Card */}
          <div
            className="rounded-3xl p-6 shadow-lg"
            style={{ background: `linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)` }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">Today's Intake</p>
                <p className="text-5xl font-semibold text-white">{todayWater}</p>
                <p className="text-lg text-white/80">/ {waterGoal} oz</p>
              </div>
              <div className="relative h-24 w-24">
                <svg className="h-24 w-24 -rotate-90 transform">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="8"
                    fill="none"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="white"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(todayWater / waterGoal) * 251.2} 251.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Droplets className="h-8 w-8 text-white" />
                </div>
              </div>
            </div>

            <p className="text-sm text-white/70">
              {todayWater >= waterGoal ? '🎉 Goal reached!' : `${waterGoal - todayWater} oz to go`}
            </p>
          </div>

          {/* Quick Add Buttons */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">Quick Add</h3>
            <div className="grid grid-cols-4 gap-3">
              {[8, 12, 16, 24].map((amount) => (
                <button
                  key={amount}
                  onClick={() => handleQuickWater(amount)}
                  disabled={saving}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 border-gray-100 bg-gray-50 p-4 transition-all hover:border-blue-500 hover:bg-blue-50 active:scale-95 disabled:opacity-50"
                >
                  <Droplets className="h-6 w-6 text-blue-500" />
                  <span className="text-lg font-semibold text-gray-900">{amount}</span>
                  <span className="text-xs text-gray-500">oz</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">Custom Amount</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (waterAmount) {
                  handleQuickWater(parseInt(waterAmount));
                  setWaterAmount('');
                }
              }}
              className="flex gap-3"
            >
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={waterAmount}
                onChange={(e) => setWaterAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Enter ounces"
                className="min-h-[48px] flex-1 rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-blue-500 focus:bg-white"
                style={{ fontSize: '16px' }}
              />
              <button
                type="submit"
                disabled={!waterAmount || saving}
                className="min-h-[48px] rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white transition-all hover:bg-blue-600 disabled:opacity-50"
              >
                Add
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'exercise' && (
        <div className="space-y-6">
          {/* Weekly Progress Card */}
          <div
            className="rounded-3xl p-6 shadow-lg"
            style={{ background: `linear-gradient(135deg, #10B981 0%, #059669 100%)` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">This Week</p>
                <p className="text-5xl font-semibold text-white">{weeklyMinutes}</p>
                <p className="text-lg text-white/80">/ 150 min goal</p>
              </div>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
                <Dumbbell className="h-10 w-10 text-white" />
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-all"
                  style={{ width: `${Math.min(100, (weeklyMinutes / 150) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Log Exercise */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">Log Exercise</h3>

            {/* Activity Type */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-500">Activity</label>
              <div className="grid grid-cols-4 gap-2">
                {exerciseTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setExerciseType(type.value)}
                    className={`flex flex-col items-center gap-1 rounded-xl p-3 transition-all ${
                      exerciseType === type.value
                        ? 'bg-emerald-500 text-white shadow-lg'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-xl">{type.icon}</span>
                    <span className="text-xs font-medium">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-500">
                Duration (minutes)
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={exerciseDuration}
                onChange={(e) => setExerciseDuration(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="30"
                className="min-h-[48px] w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-emerald-500 focus:bg-white"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Intensity */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-500">Intensity</label>
              <div className="flex gap-2">
                {['light', 'moderate', 'vigorous'].map((intensity) => (
                  <button
                    key={intensity}
                    onClick={() => setExerciseIntensity(intensity)}
                    className={`flex-1 rounded-xl py-3 text-sm font-semibold capitalize transition-all ${
                      exerciseIntensity === intensity
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {intensity}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogExercise}
              disabled={!exerciseDuration || saving}
              className="min-h-[48px] w-full rounded-xl bg-emerald-500 py-4 font-semibold text-white transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Log Exercise'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'sleep' && (
        <div className="space-y-6">
          {/* Sleep Stats Card */}
          <div
            className="rounded-3xl p-6 shadow-lg"
            style={{ background: `linear-gradient(135deg, #4fa77e 0%, #3B8C64 100%)` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">Weekly Average</p>
                <p className="text-5xl font-semibold text-white">{avgSleepHours || '--'}</p>
                <p className="text-lg text-white/80">hours / night</p>
              </div>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
                <Moon className="h-10 w-10 text-white" />
              </div>
            </div>
          </div>

          {/* Log Sleep */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">Log Last Night's Sleep</h3>

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-500">Bedtime</label>
                <input
                  type="time"
                  value={sleepStart}
                  onChange={(e) => setSleepStart(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-emerald-500 focus:bg-white"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-500">Wake Time</label>
                <input
                  type="time"
                  value={sleepEnd}
                  onChange={(e) => setSleepEnd(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-emerald-500 focus:bg-white"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            {/* Sleep Quality */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-500">
                Sleep Quality: {sleepQuality}/10
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={sleepQuality}
                onChange={(e) => setSleepQuality(parseInt(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-400">
                <span>Poor</span>
                <span>Excellent</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogSleep}
              disabled={saving}
              className="min-h-[48px] w-full rounded-xl bg-emerald-500 py-4 font-semibold text-white transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Log Sleep'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'nutrition' && (
        <div className="space-y-6">
          {/* Today's Calories Card */}
          <div
            className="rounded-3xl p-6 shadow-lg"
            style={{ background: `linear-gradient(135deg, #F59E0B 0%, #D97706 100%)` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">Today's Calories</p>
                <p className="text-5xl font-semibold text-white">{todayCalories}</p>
                <p className="text-lg text-white/80">kcal consumed</p>
              </div>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
                <Utensils className="h-10 w-10 text-white" />
              </div>
            </div>
          </div>

          {/* Log Meal */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">Log Meal</h3>

            {/* Meal Type */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-500">Meal Type</label>
              <div className="grid grid-cols-4 gap-2">
                {mealTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setMealType(type.value)}
                      className={`flex flex-col items-center gap-1 rounded-xl p-3 transition-all ${
                        mealType === type.value
                          ? 'bg-amber-500 text-white shadow-lg'
                          : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-500">
                What did you eat?
              </label>
              <input
                type="text"
                value={mealDescription}
                onChange={(e) => setMealDescription(e.target.value)}
                placeholder="e.g., Grilled chicken salad"
                className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 font-medium outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>

            {/* Calories */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-500">
                Calories (optional)
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={mealCalories}
                onChange={(e) => setMealCalories(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="500"
                className="min-h-[48px] w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-amber-500 focus:bg-white"
                style={{ fontSize: '16px' }}
              />
            </div>

            <button
              type="button"
              onClick={handleLogMeal}
              disabled={saving}
              className="min-h-[48px] w-full rounded-xl bg-amber-500 py-4 font-semibold text-white transition-all hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Log Meal'}
            </button>
          </div>
        </div>
      )}

      {/* Tips Card - compact on mobile */}
      <div className="mt-4 rounded-xl bg-gradient-to-br from-blue-50 to-emerald-50 p-4 md:mt-6 md:rounded-2xl md:p-5">
        <div className="mb-2 flex items-center gap-2 md:mb-3">
          <Award className="h-4 w-4 text-blue-600 md:h-5 md:w-5" />
          <h3 className="text-sm font-semibold text-gray-900 md:text-base">
            {t('progressWellnessTips')}
          </h3>
        </div>
        <ul className="space-y-1.5 text-xs text-gray-600 md:space-y-2 md:text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            {t('progressTipConsistent')}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            {t('progressTipHabits')}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            {t('progressTipCelebrate')}
          </li>
        </ul>
      </div>
    </div>
  );
}
