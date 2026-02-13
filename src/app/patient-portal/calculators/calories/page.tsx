'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { ringColorStyle } from '@/lib/utils/css-ring-color';
import { ArrowLeft, Info, Flame, Target, Clock } from 'lucide-react';

const activityLevels = [
  { value: 1.2, label: 'Sedentary', description: 'Little to no exercise' },
  { value: 1.375, label: 'Light', description: 'Exercise 1-3 days/week' },
  { value: 1.55, label: 'Moderate', description: 'Exercise 3-5 days/week' },
  { value: 1.725, label: 'Active', description: 'Exercise 6-7 days/week' },
  { value: 1.9, label: 'Very Active', description: 'Hard exercise daily' },
];

const lossRates = [
  { value: 0.5, label: '0.5 lb/week', description: 'Slow & steady' },
  { value: 1, label: '1 lb/week', description: 'Recommended' },
  { value: 1.5, label: '1.5 lb/week', description: 'Moderate' },
  { value: 2, label: '2 lb/week', description: 'Aggressive' },
];

export default function CalorieCalculatorPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const [gender, setGender] = useState<'male' | 'female'>('female');
  const [age, setAge] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weight, setWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [activity, setActivity] = useState(1.55);
  const [lossRate, setLossRate] = useState(1);

  const results = useMemo(() => {
    const heightCm = (parseInt(feet || '0') * 12 + parseInt(inches || '0')) * 2.54;
    const weightKg = parseFloat(weight || '0') * 0.453592;
    const ageNum = parseInt(age || '0');
    const goalWeightLbs = parseFloat(goalWeight || '0');
    const currentWeightLbs = parseFloat(weight || '0');

    if (heightCm <= 0 || weightKg <= 0 || ageNum <= 0) {
      return null;
    }

    // BMR using Mifflin-St Jeor Equation
    let bmr: number;
    if (gender === 'male') {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageNum + 5;
    } else {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageNum - 161;
    }

    const maintenanceCalories = Math.round(bmr * activity);

    // Calories needed to lose weight (3500 cal = 1 lb)
    const dailyDeficit = (lossRate * 3500) / 7;
    const targetCalories = Math.round(maintenanceCalories - dailyDeficit);

    // Timeline to goal
    let weeksToGoal = null;
    if (goalWeightLbs > 0 && goalWeightLbs < currentWeightLbs) {
      const weightToLose = currentWeightLbs - goalWeightLbs;
      weeksToGoal = Math.ceil(weightToLose / lossRate);
    }

    return {
      bmr: Math.round(bmr),
      maintenanceCalories,
      targetCalories: Math.max(targetCalories, gender === 'male' ? 1500 : 1200),
      deficit: Math.round(dailyDeficit),
      weeksToGoal,
      monthsToGoal: weeksToGoal ? Math.ceil(weeksToGoal / 4) : null,
    };
  }, [gender, age, feet, inches, weight, goalWeight, activity, lossRate]);

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`${PATIENT_PORTAL_PATH}/calculators`}
          className="mb-2 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Calculators
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Calorie Calculator</h1>
        <p className="mt-1 text-gray-500">Calculate your daily calorie needs for weight loss</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Form */}
        <div className="space-y-6 lg:col-span-2">
          {/* Basic Info */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Basic Information</h2>

            {/* Gender */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Gender</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setGender('female')}
                  className={`rounded-xl px-4 py-3 font-medium transition-all ${
                    gender === 'female'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={gender === 'female' ? { backgroundColor: primaryColor } : {}}
                >
                  Female
                </button>
                <button
                  onClick={() => setGender('male')}
                  className={`rounded-xl px-4 py-3 font-medium transition-all ${
                    gender === 'male' ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={gender === 'male' ? { backgroundColor: primaryColor } : {}}
                >
                  Male
                </button>
              </div>
            </div>

            {/* Age */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Age</label>
              <div className="relative">
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="0"
                  min="18"
                  max="100"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-16 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-opacity-50"
                  style={ringColorStyle(primaryColor)}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  years
                </span>
              </div>
            </div>

            {/* Height */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Height</label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={feet}
                    onChange={(e) => setFeet(e.target.value)}
                    placeholder="0"
                    min="0"
                    max="8"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={ringColorStyle(primaryColor)}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    ft
                  </span>
                </div>
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={inches}
                    onChange={(e) => setInches(e.target.value)}
                    placeholder="0"
                    min="0"
                    max="11"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={ringColorStyle(primaryColor)}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    in
                  </span>
                </div>
              </div>
            </div>

            {/* Weight */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Current Weight
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={ringColorStyle(primaryColor)}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    lbs
                  </span>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Goal Weight</label>
                <div className="relative">
                  <input
                    type="number"
                    value={goalWeight}
                    onChange={(e) => setGoalWeight(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={ringColorStyle(primaryColor)}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    lbs
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity Level */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Activity Level</h2>
            <div className="space-y-2">
              {activityLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setActivity(level.value)}
                  className={`flex w-full items-center justify-between rounded-xl border-2 p-4 transition-all ${
                    activity === level.value
                      ? 'border-opacity-100'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={
                    activity === level.value
                      ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` }
                      : {}
                  }
                >
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{level.label}</p>
                    <p className="text-sm text-gray-500">{level.description}</p>
                  </div>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      activity === level.value ? '' : 'border-gray-300'
                    }`}
                    style={activity === level.value ? { borderColor: primaryColor } : {}}
                  >
                    {activity === level.value && (
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: primaryColor }}
                      />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Weight Loss Rate */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Weight Loss Goal</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {lossRates.map((rate) => (
                <button
                  key={rate.value}
                  onClick={() => setLossRate(rate.value)}
                  className={`rounded-xl border-2 p-4 transition-all ${
                    lossRate === rate.value ? '' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={
                    lossRate === rate.value
                      ? {
                          borderColor: primaryColor,
                          backgroundColor: `${primaryColor}08`,
                        }
                      : {}
                  }
                >
                  <p className="font-semibold text-gray-900">{rate.label}</p>
                  <p className="mt-1 text-xs text-gray-500">{rate.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-6">
          {/* Daily Calories */}
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: accentColor }}>
            <Flame className="mx-auto mb-2 h-8 w-8" style={{ color: '#333' }} />
            <h2 className="mb-1 font-semibold" style={{ color: '#333' }}>
              Daily Calories
            </h2>
            <p className="mb-4 text-sm" style={{ color: '#555' }}>
              To lose {lossRate} lb/week
            </p>

            <div className="mb-2 text-6xl font-semibold" style={{ color: '#1a1a1a' }}>
              {results?.targetCalories || '--'}
            </div>
            <p className="text-sm" style={{ color: '#555' }}>
              calories/day
            </p>
          </div>

          {/* Other Stats */}
          {results && (
            <>
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-gray-50 p-3 text-center">
                    <p className="mb-1 text-xs text-gray-500">BMR</p>
                    <p className="text-xl font-semibold text-gray-900">{results.bmr}</p>
                    <p className="text-xs text-gray-400">cal/day</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 text-center">
                    <p className="mb-1 text-xs text-gray-500">Maintenance</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {results.maintenanceCalories}
                    </p>
                    <p className="text-xs text-gray-400">cal/day</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-700">Daily Deficit</p>
                  <p className="text-2xl font-semibold text-red-600">-{results.deficit} cal</p>
                </div>
              </div>

              {/* Timeline */}
              {results.weeksToGoal && (
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className="rounded-lg p-2"
                      style={{ backgroundColor: `${primaryColor}15` }}
                    >
                      <Clock className="h-5 w-5" style={{ color: primaryColor }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Estimated Timeline</h3>
                      <p className="text-xs text-gray-500">To reach {goalWeight} lbs</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div
                      className="rounded-xl p-3 text-center"
                      style={{ backgroundColor: `${primaryColor}08` }}
                    >
                      <p className="text-3xl font-semibold" style={{ color: primaryColor }}>
                        {results.weeksToGoal}
                      </p>
                      <p className="text-xs text-gray-500">weeks</p>
                    </div>
                    <div
                      className="rounded-xl p-3 text-center"
                      style={{ backgroundColor: `${primaryColor}08` }}
                    >
                      <p className="text-3xl font-semibold" style={{ color: primaryColor }}>
                        {results.monthsToGoal}
                      </p>
                      <p className="text-xs text-gray-500">months</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Info Box */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <Info className="mb-2 h-5 w-5 text-blue-600" />
            <h3 className="mb-2 font-semibold text-blue-900">Important Note</h3>
            <p className="text-sm leading-relaxed text-blue-800">
              Women should not consume fewer than 1,200 calories/day and men not fewer than 1,500
              calories/day without medical supervision. GLP-1 medications can help reduce appetite
              naturally.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
