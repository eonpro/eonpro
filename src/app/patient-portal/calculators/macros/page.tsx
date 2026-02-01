'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import {
  ArrowLeft,
  Info,
  Target,
  Beef,
  Wheat,
  Droplet,
  Check,
  Utensils,
} from 'lucide-react';
import {
  calculateMacros,
  getGLP1MacroRecommendations,
  distributeMacrosToMeals,
  MACRO_PRESETS,
  PROTEIN_SOURCES,
  type MacroGoal,
} from '@/lib/calculators';

export default function MacroCalculatorPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const [calories, setCalories] = useState('');
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState<MacroGoal>('weight_loss');
  const [isOnGLP1, setIsOnGLP1] = useState(false);
  const [showMealBreakdown, setShowMealBreakdown] = useState(false);

  const result = useMemo(() => {
    const cals = parseInt(calories);
    const weightLbs = parseFloat(weight) || 150;
    
    if (!cals || cals < 800) return null;
    
    if (isOnGLP1) {
      return getGLP1MacroRecommendations(cals);
    }
    
    return calculateMacros(cals, goal, weightLbs);
  }, [calories, weight, goal, isOnGLP1]);

  const mealDistribution = useMemo(() => {
    if (!result) return null;
    return distributeMacrosToMeals(result.grams);
  }, [result]);

  const totalPercentage = result
    ? result.percentages.protein + result.percentages.carbs + result.percentages.fat
    : 0;

  return (
    <div className="min-h-[100dvh] px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/patient-portal/calculators"
          className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Tools
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Macro Calculator</h1>
        <p className="mt-1 text-gray-500">
          Calculate your daily protein, carbs, and fat targets
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Section */}
        <div className="space-y-5">
          {/* Calorie Input */}
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Daily Calorie Target
            </label>
            <div className="relative">
              <input
                type="number"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="1800"
                min="800"
                max="5000"
                className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-4 text-center text-3xl font-semibold text-gray-900 outline-none transition-all placeholder:text-gray-300 focus:border-gray-900 focus:bg-white"
                style={{ fontSize: '28px' }}
              />
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-medium uppercase tracking-wider text-gray-400">
                calories per day
              </span>
            </div>
            <p className="mt-3 text-center text-sm text-gray-500">
              Use our{' '}
              <Link
                href="/patient-portal/calculators/calories"
                className="font-medium underline"
                style={{ color: primaryColor }}
              >
                Calorie Calculator
              </Link>{' '}
              if you don't know your target
            </p>
          </div>

          {/* Weight Input */}
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Current Weight (for protein calculation)
            </label>
            <div className="relative">
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="180"
                min="80"
                max="500"
                className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-3 pr-12 text-lg font-semibold text-gray-900 outline-none transition-all placeholder:text-gray-300 focus:border-gray-900 focus:bg-white"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                lbs
              </span>
            </div>
          </div>

          {/* Goal Selection */}
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Select Your Goal</h3>
            <div className="space-y-2">
              {MACRO_PRESETS.slice(0, 4).map((preset) => (
                <button
                  key={preset.goal}
                  onClick={() => setGoal(preset.goal)}
                  className={`w-full flex items-center justify-between rounded-xl border-2 p-4 transition-all ${
                    goal === preset.goal
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{preset.label}</p>
                    <p className="text-sm text-gray-500">{preset.description}</p>
                  </div>
                  {goal === preset.goal && (
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* GLP-1 Toggle */}
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Taking GLP-1 Medication?</p>
                <p className="text-sm text-gray-500">
                  Get protein-focused recommendations
                </p>
              </div>
              <button
                onClick={() => setIsOnGLP1(!isOnGLP1)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  isOnGLP1 ? '' : 'bg-gray-300'
                }`}
                style={isOnGLP1 ? { backgroundColor: primaryColor } : {}}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    isOnGLP1 ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-5">
          {/* Macro Breakdown Chart */}
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: accentColor }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-5 w-5 text-gray-700" />
              <h3 className="font-semibold text-gray-900">Daily Macro Targets</h3>
            </div>

            {result ? (
              <>
                {/* Pie Chart Visualization */}
                <div className="flex justify-center mb-6">
                  <div className="relative w-48 h-48">
                    <svg viewBox="0 0 100 100" className="transform -rotate-90">
                      {/* Protein */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#EF4444"
                        strokeWidth="20"
                        strokeDasharray={`${result.percentages.protein * 2.51} 251`}
                        strokeDashoffset="0"
                      />
                      {/* Carbs */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#3B82F6"
                        strokeWidth="20"
                        strokeDasharray={`${result.percentages.carbs * 2.51} 251`}
                        strokeDashoffset={`${-result.percentages.protein * 2.51}`}
                      />
                      {/* Fat */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth="20"
                        strokeDasharray={`${result.percentages.fat * 2.51} 251`}
                        strokeDashoffset={`${-(result.percentages.protein + result.percentages.carbs) * 2.51}`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-3xl font-bold text-gray-900">{calories || 0}</p>
                      <p className="text-sm text-gray-600">calories</p>
                    </div>
                  </div>
                </div>

                {/* Macro Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white/50 p-4 text-center backdrop-blur-sm">
                    <div className="flex justify-center mb-2">
                      <Beef className="h-6 w-6 text-red-500" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{result.grams.protein}g</p>
                    <p className="text-xs text-gray-600">Protein</p>
                    <p className="text-xs font-medium text-red-500">{result.percentages.protein}%</p>
                  </div>
                  <div className="rounded-xl bg-white/50 p-4 text-center backdrop-blur-sm">
                    <div className="flex justify-center mb-2">
                      <Wheat className="h-6 w-6 text-blue-500" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{result.grams.carbs}g</p>
                    <p className="text-xs text-gray-600">Carbs</p>
                    <p className="text-xs font-medium text-blue-500">{result.percentages.carbs}%</p>
                  </div>
                  <div className="rounded-xl bg-white/50 p-4 text-center backdrop-blur-sm">
                    <div className="flex justify-center mb-2">
                      <Droplet className="h-6 w-6 text-amber-500" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{result.grams.fat}g</p>
                    <p className="text-xs text-gray-600">Fat</p>
                    <p className="text-xs font-medium text-amber-500">{result.percentages.fat}%</p>
                  </div>
                </div>

                {/* Fiber Target */}
                <div className="mt-4 p-3 rounded-xl bg-white/30 text-center">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Fiber Goal:</span> {result.grams.fiber}g daily
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Target className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Enter your calorie target to see macros</p>
              </div>
            )}
          </div>

          {/* GLP-1 Tips */}
          {isOnGLP1 && result && 'glp1Tips' in result && (
            <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
              <h3 className="font-semibold text-gray-900 mb-3">
                GLP-1 Nutrition Tips
              </h3>
              <ul className="space-y-2">
                {(result as { glp1Tips: string[] }).glp1Tips.slice(0, 5).map((tip: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: primaryColor }} />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Meal Distribution Toggle */}
          {result && (
            <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
              <button
                onClick={() => setShowMealBreakdown(!showMealBreakdown)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <Utensils className="h-5 w-5" style={{ color: primaryColor }} />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Meal-by-Meal Breakdown</p>
                    <p className="text-sm text-gray-500">How to split macros across meals</p>
                  </div>
                </div>
                <div
                  className={`transform transition-transform ${showMealBreakdown ? 'rotate-180' : ''}`}
                >
                  <ArrowLeft className="h-5 w-5 text-gray-400 -rotate-90" />
                </div>
              </button>

              {showMealBreakdown && mealDistribution && (
                <div className="mt-4 space-y-3">
                  {mealDistribution.map((meal) => (
                    <div
                      key={meal.meal}
                      className="p-4 rounded-xl bg-gray-50"
                    >
                      <p className="font-medium text-gray-900 mb-2">{meal.meal}</p>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="text-center">
                          <p className="font-semibold text-red-600">{meal.protein}g</p>
                          <p className="text-xs text-gray-500">Protein</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-blue-600">{meal.carbs}g</p>
                          <p className="text-xs text-gray-500">Carbs</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-amber-600">{meal.fat}g</p>
                          <p className="text-xs text-gray-500">Fat</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Protein Sources */}
          {result && (
            <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Beef className="h-5 w-5 text-red-500" />
                Lean Protein Sources
              </h3>
              <div className="space-y-2">
                {PROTEIN_SOURCES.lean.slice(0, 4).map((source) => (
                  <div
                    key={source.name}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50"
                  >
                    <span className="text-sm text-gray-700">{source.name}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {source.gramsPerOz}g per oz
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result && result.recommendations && (
            <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
              <h3 className="font-semibold text-gray-900 mb-3">Recommendations</h3>
              <ul className="space-y-2">
                {result.recommendations.slice(0, 4).map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: primaryColor }} />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Info Box */}
          <div
            className="rounded-2xl border-2 p-5"
            style={{ borderColor: `${primaryColor}30`, backgroundColor: `${primaryColor}08` }}
          >
            <Info className="mb-2 h-5 w-5" style={{ color: primaryColor }} />
            <h3 className="font-semibold mb-2" style={{ color: primaryColor }}>
              About Macros
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              Macronutrients provide the calories your body needs. Protein (4 cal/g) builds muscle, 
              carbs (4 cal/g) provide energy, and fats (9 cal/g) support hormones and absorption. 
              For weight loss, prioritize protein to preserve muscle mass.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
