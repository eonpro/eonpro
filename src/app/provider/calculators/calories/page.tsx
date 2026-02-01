'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Flame,
  Target,
  Clock,
  Info,
  AlertTriangle,
  Copy,
  Check,
  TrendingDown,
  Activity,
} from 'lucide-react';
import {
  calculateCalorieNeeds,
  calculateMacros,
  getGLP1CalorieAdjustment,
  getMinimumSafeCalories,
  validateCalorieInput,
  ACTIVITY_LEVELS,
  WEIGHT_LOSS_RATES,
  type ActivityLevel,
  type CalorieResult,
} from '@/lib/calculators';

export default function ProviderCalorieCalculatorPage() {
  const [sex, setSex] = useState<'male' | 'female'>('female');
  const [age, setAge] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weight, setWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [lossRate, setLossRate] = useState(1);
  const [isOnGLP1, setIsOnGLP1] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const heightInches = useMemo(() => {
    const f = parseInt(feet || '0');
    const i = parseInt(inches || '0');
    return f * 12 + i;
  }, [feet, inches]);

  const validation = useMemo(() => {
    return validateCalorieInput({
      age: parseInt(age) || undefined,
      sex,
      weightLbs: parseFloat(weight) || undefined,
      heightInches: heightInches || undefined,
      activityLevel,
    });
  }, [age, sex, weight, heightInches, activityLevel]);

  const result = useMemo(() => {
    if (!validation.valid) return null;

    return calculateCalorieNeeds(
      {
        age: parseInt(age),
        sex,
        weightLbs: parseFloat(weight),
        heightInches,
        activityLevel,
      },
      goalWeight ? parseFloat(goalWeight) : undefined,
      lossRate
    );
  }, [validation, age, sex, weight, heightInches, activityLevel, goalWeight, lossRate]);

  const macros = useMemo(() => {
    if (!result) return null;
    return calculateMacros(result.targetCalories, parseFloat(weight) || 150, 'weight_loss');
  }, [result, weight]);

  const glp1Adjustment = useMemo(() => {
    if (!result || !isOnGLP1) return null;
    return getGLP1CalorieAdjustment(result.targetCalories);
  }, [result, isOnGLP1]);

  const minimumCalories = getMinimumSafeCalories(sex);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const generateDocumentation = () => {
    if (!result) return '';
    const effectiveCalories = isOnGLP1 && glp1Adjustment 
      ? glp1Adjustment.adjusted 
      : result.targetCalories;

    return `Calorie Prescription

Patient Data:
- Age: ${age} years
- Sex: ${sex}
- Height: ${feet}'${inches}"
- Current Weight: ${weight} lbs
- Goal Weight: ${goalWeight || 'Not specified'} lbs
- Activity Level: ${ACTIVITY_LEVELS.find(a => a.level === activityLevel)?.label}
- GLP-1 Therapy: ${isOnGLP1 ? 'Yes' : 'No'}

Calculations:
- BMR: ${result.bmr} cal/day
- TDEE (Maintenance): ${result.tdee} cal/day
- Target Calories: ${effectiveCalories} cal/day
- Daily Deficit: ${result.deficit} cal/day

${result.weeksToGoal ? `Timeline: ~${result.weeksToGoal} weeks (${result.monthsToGoal} months) to goal` : ''}

Macronutrient Targets (${effectiveCalories} cal):
- Protein: ${macros?.protein.grams}g (${macros?.protein.percentage}%)
- Carbs: ${macros?.carbs.grams}g (${macros?.carbs.percentage}%)
- Fat: ${macros?.fat.grams}g (${macros?.fat.percentage}%)`;
  };

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/provider/calculators"
          className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Calculators
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Calorie Calculator</h1>
        <p className="text-gray-500 mt-1">
          Calculate daily calorie needs for weight management with GLP-1 considerations
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Patient Information</h2>

            {/* Sex & Age */}
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sex</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSex('female')}
                    className={`flex-1 rounded-xl px-4 py-3 font-medium transition-all border-2 ${
                      sex === 'female'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Female
                  </button>
                  <button
                    onClick={() => setSex('male')}
                    className={`flex-1 rounded-xl px-4 py-3 font-medium transition-all border-2 ${
                      sex === 'male'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Male
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Age</label>
                <div className="relative">
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="35"
                    min="18"
                    max="100"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-16 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    years
                  </span>
                </div>
              </div>
            </div>

            {/* Height */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Height</label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={feet}
                    onChange={(e) => setFeet(e.target.value)}
                    placeholder="5"
                    min="4"
                    max="7"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">ft</span>
                </div>
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={inches}
                    onChange={(e) => setInches(e.target.value)}
                    placeholder="6"
                    min="0"
                    max="11"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">in</span>
                </div>
              </div>
            </div>

            {/* Weight */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Current Weight</label>
                <div className="relative">
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="180"
                    min="80"
                    max="700"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">lbs</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Goal Weight</label>
                <div className="relative">
                  <input
                    type="number"
                    value={goalWeight}
                    onChange={(e) => setGoalWeight(e.target.value)}
                    placeholder="150"
                    min="80"
                    max="500"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">lbs</span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity Level */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-500" />
              Activity Level
            </h2>
            <div className="space-y-2">
              {ACTIVITY_LEVELS.map((level) => (
                <button
                  key={level.level}
                  onClick={() => setActivityLevel(level.level)}
                  className={`w-full flex items-center justify-between rounded-xl border-2 p-4 transition-all ${
                    activityLevel === level.level
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{level.label}</p>
                    <p className="text-sm text-gray-500">{level.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-500">×{level.multiplier}</span>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        activityLevel === level.level
                          ? 'border-green-500 bg-green-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {activityLevel === level.level && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Weight Loss Rate */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-blue-500" />
              Weight Loss Rate
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {WEIGHT_LOSS_RATES.map((rate) => (
                <button
                  key={rate.lbsPerWeek}
                  onClick={() => setLossRate(rate.lbsPerWeek)}
                  className={`rounded-xl border-2 p-4 text-center transition-all ${
                    lossRate === rate.lbsPerWeek
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{rate.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{rate.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* GLP-1 Toggle */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">On GLP-1 Medication?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Adjusts calorie targets for reduced appetite
                </p>
              </div>
              <button
                onClick={() => setIsOnGLP1(!isOnGLP1)}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                  isOnGLP1 ? 'bg-purple-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ${
                    isOnGLP1 ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {/* Daily Calories Card */}
          <div className="rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 p-6 text-white">
            <Flame className="mx-auto mb-3 h-10 w-10 opacity-80" />
            <p className="text-sm font-medium opacity-80 mb-1 text-center">
              {isOnGLP1 ? 'Adjusted Daily Calories' : 'Target Daily Calories'}
            </p>
            <p className="text-6xl font-bold mb-2 text-center">
              {result 
                ? (isOnGLP1 && glp1Adjustment ? glp1Adjustment.adjusted : result.targetCalories)
                : '--'}
            </p>
            <p className="text-sm opacity-80 text-center">
              to lose {lossRate} lb/week
            </p>
          </div>

          {result && (
            <>
              {/* Metabolism Stats */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Metabolism</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-gray-50 text-center">
                    <p className="text-xs text-gray-500 mb-1">BMR</p>
                    <p className="text-xl font-bold text-gray-900">{result.bmr}</p>
                    <p className="text-xs text-gray-400">cal/day</p>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50 text-center">
                    <p className="text-xs text-gray-500 mb-1">Maintenance</p>
                    <p className="text-xl font-bold text-gray-900">{result.tdee}</p>
                    <p className="text-xs text-gray-400">cal/day</p>
                  </div>
                </div>
                <div className="mt-3 p-3 rounded-xl bg-red-50">
                  <p className="text-xs text-red-600 mb-1">Daily Deficit</p>
                  <p className="text-xl font-bold text-red-700">-{result.deficit} cal</p>
                </div>
              </div>

              {/* Timeline */}
              {result.weeksToGoal && (
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-500" />
                    Estimated Timeline
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">
                    To reach {goalWeight} lbs from {weight} lbs
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-blue-50 text-center">
                      <p className="text-3xl font-bold text-blue-600">{result.weeksToGoal}</p>
                      <p className="text-xs text-gray-500">weeks</p>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 text-center">
                      <p className="text-3xl font-bold text-blue-600">{result.monthsToGoal}</p>
                      <p className="text-xs text-gray-500">months</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Macros */}
              {macros && (
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    <Target className="h-5 w-5 text-purple-500 inline mr-2" />
                    Macro Targets
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Protein</span>
                      <span className="font-semibold text-gray-900">
                        {macros.protein.grams}g ({macros.protein.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full"
                        style={{ width: `${macros.protein.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Carbs</span>
                      <span className="font-semibold text-gray-900">
                        {macros.carbs.grams}g ({macros.carbs.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${macros.carbs.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Fat</span>
                      <span className="font-semibold text-gray-900">
                        {macros.fat.grams}g ({macros.fat.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full"
                        style={{ width: `${macros.fat.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* GLP-1 Note */}
              {isOnGLP1 && glp1Adjustment && (
                <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
                  <p className="text-sm text-purple-800">
                    <strong>GLP-1 Adjustment:</strong> {glp1Adjustment.note}
                  </p>
                </div>
              )}

              {/* Copy Documentation */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <button
                  onClick={() => copyToClipboard(generateDocumentation())}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
                >
                  {copiedText ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Prescription
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Safety Warning */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <AlertTriangle className="mb-2 h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-amber-900 mb-2">Minimum Safe Intake</h3>
            <p className="text-sm text-amber-800">
              {sex === 'female' ? 'Women' : 'Men'} should not consume fewer than{' '}
              <strong>{minimumCalories}</strong> calories/day without medical supervision.
              {isOnGLP1 && ' GLP-1 medications naturally reduce appetite - ensure adequate nutrition.'}
            </p>
          </div>

          {/* Formula Info */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <Info className="mb-2 h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900 mb-2">Calculation Method</h3>
            <p className="text-sm text-blue-800">
              Uses the Mifflin-St Jeor equation for BMR, considered the most accurate 
              for modern populations. TDEE = BMR × Activity Factor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
