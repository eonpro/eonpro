'use client';

import { useState, useEffect } from 'react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { getAuthHeaders } from '@/lib/utils/auth-token';
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

const tabs = [
  { id: 'weight' as TabType, label: 'Weight', icon: Scale },
  { id: 'water' as TabType, label: 'Water', icon: Droplets },
  { id: 'exercise' as TabType, label: 'Exercise', icon: Footprints },
  { id: 'sleep' as TabType, label: 'Sleep', icon: Moon },
  { id: 'nutrition' as TabType, label: 'Nutrition', icon: Utensils },
];

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
  const accentColor = branding?.accentColor || '#d3f931';
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [patientId, setPatientId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('weight');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState('');

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
      fetchData();
    }
  }, [patientId, activeTab]);

  const fetchData = async () => {
    try {
      const headers = getAuthHeaders();
      // Fetch data based on active tab
      if (activeTab === 'weight') {
        const response = await fetch(`/api/patient-progress/weight?patientId=${patientId}`, {
          headers,
          credentials: 'include',
        });
        if (response.ok) {
          const result = await response.json();
          const logs = Array.isArray(result) ? result : (result.data || []);
          setWeightLogs(logs);
        }
      } else if (activeTab === 'water') {
        const response = await fetch(`/api/patient-progress/water?patientId=${patientId}`, {
          headers,
          credentials: 'include',
        });
        if (response.ok) {
          const result = await response.json();
          setTodayWater(result.meta?.todayTotal || 0);
        }
      } else if (activeTab === 'exercise') {
        const response = await fetch(`/api/patient-progress/exercise?patientId=${patientId}`, {
          headers,
          credentials: 'include',
        });
        if (response.ok) {
          const result = await response.json();
          setWeeklyMinutes(result.meta?.weeklyMinutes || 0);
        }
      } else if (activeTab === 'sleep') {
        const response = await fetch(`/api/patient-progress/sleep?patientId=${patientId}`, {
          headers,
          credentials: 'include',
        });
        if (response.ok) {
          const result = await response.json();
          setAvgSleepHours(result.meta?.avgSleepHours || 0);
        }
      } else if (activeTab === 'nutrition') {
        const response = await fetch(`/api/patient-progress/nutrition?patientId=${patientId}`, {
          headers,
          credentials: 'include',
        });
        if (response.ok) {
          const result = await response.json();
          setTodayCalories(result.meta?.todayCalories || 0);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setError('Failed to load health data. Please check your connection and try again.');
    }
  };

  const handleQuickWater = async (amount: number) => {
    if (!patientId) return;
    setSaving(true);
    try {
      const response = await fetch('/api/patient-progress/water', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ patientId, amount, unit: 'oz' }),
      });
      if (response.ok) {
        setTodayWater(prev => prev + amount);
        setShowSuccess(`+${amount} oz added!`);
        setTimeout(() => setShowSuccess(''), 2000);
      }
    } catch (error) {
      console.error('Failed to log water:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleLogExercise = async () => {
    if (!patientId || !exerciseDuration) return;
    setSaving(true);
    try {
      const response = await fetch('/api/patient-progress/exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          patientId,
          activityType: exerciseType,
          duration: parseInt(exerciseDuration),
          intensity: exerciseIntensity,
        }),
      });
      if (response.ok) {
        setWeeklyMinutes(prev => prev + parseInt(exerciseDuration));
        setExerciseDuration('');
        setShowSuccess('Exercise logged!');
        setTimeout(() => setShowSuccess(''), 2000);
      }
    } catch (error) {
      console.error('Failed to log exercise:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleLogSleep = async () => {
    if (!patientId) return;
    setSaving(true);
    try {
      // Create datetime from today's date with the times
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const [startHour, startMin] = sleepStart.split(':').map(Number);
      const [endHour, endMin] = sleepEnd.split(':').map(Number);

      const sleepStartDate = new Date(yesterday);
      sleepStartDate.setHours(startHour, startMin, 0, 0);

      const sleepEndDate = new Date(today);
      sleepEndDate.setHours(endHour, endMin, 0, 0);

      const response = await fetch('/api/patient-progress/sleep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          patientId,
          sleepStart: sleepStartDate.toISOString(),
          sleepEnd: sleepEndDate.toISOString(),
          quality: sleepQuality,
        }),
      });
      if (response.ok) {
        setShowSuccess('Sleep logged!');
        fetchData();
        setTimeout(() => setShowSuccess(''), 2000);
      }
    } catch (error) {
      console.error('Failed to log sleep:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleLogMeal = async () => {
    if (!patientId) return;
    setSaving(true);
    try {
      const response = await fetch('/api/patient-progress/nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          patientId,
          mealType,
          description: mealDescription,
          calories: mealCalories ? parseInt(mealCalories) : undefined,
        }),
      });
      if (response.ok) {
        if (mealCalories) {
          setTodayCalories(prev => prev + parseInt(mealCalories));
        }
        setMealDescription('');
        setMealCalories('');
        setShowSuccess('Meal logged!');
        setTimeout(() => setShowSuccess(''), 2000);
      }
    } catch (error) {
      console.error('Failed to log meal:', error);
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
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 max-w-md text-center">
          <Activity className="w-12 h-12 mx-auto mb-3 text-red-300" />
          <p className="font-medium mb-2">Error Loading Health Data</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              if (patientId) fetchData();
            }}
            className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-lg text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-5 py-4 text-white shadow-2xl animate-in slide-in-from-top-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-4 w-4" />
          </div>
          <span className="font-medium">{showSuccess}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Health Tracking</h1>
        <p className="mt-1 text-sm text-gray-500">Track your daily wellness metrics</p>
      </div>

      {/* Tab Navigation - Scrollable on mobile */}
      <div className="mb-6 -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 min-w-max pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-3 font-medium transition-all ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-lg'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'weight' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                  <Activity className="h-4 w-4 text-gray-500" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{latestWeight || '--'}</p>
              <p className="text-xs font-medium text-gray-500">Current (lbs)</p>
            </div>

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
                className={`text-2xl font-semibold ${totalChange <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {totalChange > 0 ? '+' : ''}
                {totalChange.toFixed(1)}
              </p>
              <p className="text-xs font-medium text-gray-500">Change (lbs)</p>
            </div>
          </div>

          {/* Weight Tracker Component */}
          <WeightTracker
            patientId={patientId || undefined}
            variant="hims"
            accentColor={accentColor}
            showBMI={true}
            onWeightSaved={fetchData}
          />

          {/* Progress Photos Link */}
          <Link
            href="/patient-portal/photos/progress"
            className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <Camera className="h-6 w-6" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Progress Photos</p>
                <p className="text-sm text-gray-500">Track your visual transformation</p>
              </div>
            </div>
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus className="h-5 w-5 text-white" />
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
              {todayWater >= waterGoal
                ? '🎉 Goal reached!'
                : `${waterGoal - todayWater} oz to go`}
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
            <div className="flex gap-3">
              <input
                type="number"
                value={waterAmount}
                onChange={(e) => setWaterAmount(e.target.value)}
                placeholder="Enter ounces"
                className="flex-1 rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-blue-500 focus:bg-white"
              />
              <button
                onClick={() => {
                  if (waterAmount) {
                    handleQuickWater(parseInt(waterAmount));
                    setWaterAmount('');
                  }
                }}
                disabled={!waterAmount || saving}
                className="rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white transition-all hover:bg-blue-600 disabled:opacity-50"
              >
                Add
              </button>
            </div>
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
              <label className="mb-2 block text-sm font-medium text-gray-500">Duration (minutes)</label>
              <input
                type="number"
                value={exerciseDuration}
                onChange={(e) => setExerciseDuration(e.target.value)}
                placeholder="30"
                className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-emerald-500 focus:bg-white"
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
              onClick={handleLogExercise}
              disabled={!exerciseDuration || saving}
              className="w-full rounded-xl bg-emerald-500 py-4 font-semibold text-white transition-all hover:bg-emerald-600 disabled:opacity-50"
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
            style={{ background: `linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)` }}
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
                  className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-500">Wake Time</label>
                <input
                  type="time"
                  value={sleepEnd}
                  onChange={(e) => setSleepEnd(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-indigo-500 focus:bg-white"
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
                className="w-full accent-indigo-500"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-400">
                <span>Poor</span>
                <span>Excellent</span>
              </div>
            </div>

            <button
              onClick={handleLogSleep}
              disabled={saving}
              className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition-all hover:bg-indigo-600 disabled:opacity-50"
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
              <label className="mb-2 block text-sm font-medium text-gray-500">What did you eat?</label>
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
              <label className="mb-2 block text-sm font-medium text-gray-500">Calories (optional)</label>
              <input
                type="number"
                value={mealCalories}
                onChange={(e) => setMealCalories(e.target.value)}
                placeholder="500"
                className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-lg font-medium outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>

            <button
              onClick={handleLogMeal}
              disabled={saving}
              className="w-full rounded-xl bg-amber-500 py-4 font-semibold text-white transition-all hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Log Meal'}
            </button>
          </div>
        </div>
      )}

      {/* Tips Card */}
      <div className="mt-6 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Award className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Wellness Tips</h3>
        </div>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            Track consistently at the same time each day for best results
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            Small daily habits lead to big changes over time
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            Remember to celebrate your progress along the way!
          </li>
        </ul>
      </div>
    </div>
  );
}
