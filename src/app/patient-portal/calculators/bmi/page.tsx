'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { ArrowLeft, Info, Target, TrendingDown, Sparkles } from 'lucide-react';

interface BMICategory {
  label: string;
  range: string;
  color: string;
  bgColor: string;
  min: number;
  max: number;
}

const bmiCategories: BMICategory[] = [
  {
    label: 'Underweight',
    range: 'Below 18.5',
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    min: 0,
    max: 18.5,
  },
  {
    label: 'Healthy',
    range: '18.5 - 24.9',
    color: '#10B981',
    bgColor: '#ECFDF5',
    min: 18.5,
    max: 25,
  },
  {
    label: 'Overweight',
    range: '25 - 29.9',
    color: '#F59E0B',
    bgColor: '#FFFBEB',
    min: 25,
    max: 30,
  },
  {
    label: 'Obese',
    range: '30 and above',
    color: '#EF4444',
    bgColor: '#FEF2F2',
    min: 30,
    max: 100,
  },
];

export default function BMICalculatorPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weight, setWeight] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);

  const { bmi, category, gaugePosition } = useMemo(() => {
    const heightInches = parseInt(feet || '0') * 12 + parseInt(inches || '0');
    const weightLbs = parseFloat(weight || '0');

    if (heightInches > 0 && weightLbs > 0) {
      const calculatedBMI = (weightLbs / (heightInches * heightInches)) * 703;
      const cat =
        bmiCategories.find((c) => calculatedBMI >= c.min && calculatedBMI < c.max) ||
        bmiCategories[3];

      // Position on the gauge (0-100%)
      const normalizedBMI = Math.min(Math.max(calculatedBMI, 15), 40);
      const position = ((normalizedBMI - 15) / 25) * 100;

      return { bmi: calculatedBMI, category: cat, gaugePosition: position };
    }
    return { bmi: null, category: null, gaugePosition: 0 };
  }, [feet, inches, weight]);

  useEffect(() => {
    if (bmi) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 600);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [bmi]);

  const getIdealWeight = () => {
    const heightInches = parseInt(feet || '0') * 12 + parseInt(inches || '0');
    if (heightInches <= 0) return null;
    const minWeight = Math.round((18.5 * heightInches * heightInches) / 703);
    const maxWeight = Math.round((24.9 * heightInches * heightInches) / 703);
    return { min: minWeight, max: maxWeight };
  };

  const idealWeight = getIdealWeight();
  const weightToLose =
    weight && idealWeight && parseFloat(weight) > idealWeight.max
      ? parseFloat(weight) - idealWeight.max
      : 0;

  return (
    <div className="min-h-[100dvh] px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/patient-portal/calculators"
          className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Tools
        </Link>
        <h1 className="text-3xl font-semibold text-gray-900">BMI Calculator</h1>
        <p className="mt-2 text-gray-500">
          Calculate your Body Mass Index and find your healthy weight range
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Input Form - 2 cols */}
        <div className="space-y-6 lg:col-span-2">
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
            <div className="border-b border-gray-100 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Target className="h-5 w-5" style={{ color: primaryColor }} />
                Your Measurements
              </h2>
            </div>

            <div className="p-6">
              {/* Height */}
              <div className="mb-6">
                <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Height
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="group relative">
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={feet}
                        onChange={(e) => setFeet(e.target.value)}
                        placeholder="5"
                        min="0"
                        max="8"
                        className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-4 text-xl font-semibold text-gray-900 outline-none transition-all placeholder:text-gray-300 focus:border-gray-900 focus:bg-white focus:shadow-lg sm:px-5 sm:text-2xl"
                        style={{ fontSize: '20px' }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 sm:right-5 sm:text-sm">
                        ft
                      </span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="group relative">
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={inches}
                        onChange={(e) => setInches(e.target.value)}
                        placeholder="10"
                        min="0"
                        max="11"
                        className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-4 text-xl font-semibold text-gray-900 outline-none transition-all placeholder:text-gray-300 focus:border-gray-900 focus:bg-white focus:shadow-lg sm:px-5 sm:text-2xl"
                        style={{ fontSize: '20px' }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 sm:right-5 sm:text-sm">
                        in
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Weight */}
              <div className="mb-8">
                <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Weight
                </label>
                <div className="group relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="170"
                    min="0"
                    className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-4 text-xl font-semibold text-gray-900 outline-none transition-all placeholder:text-gray-300 focus:border-gray-900 focus:bg-white focus:shadow-lg sm:px-5 sm:text-2xl"
                    style={{ fontSize: '20px' }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 sm:right-5 sm:text-sm">
                    lbs
                  </span>
                </div>
              </div>

              {/* Category Legend */}
              <div className="space-y-2">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  BMI Categories
                </p>
                {bmiCategories.map((cat) => (
                  <div
                    key={cat.label}
                    className={`flex items-center justify-between rounded-2xl p-4 transition-all duration-300 ${
                      category?.label === cat.label
                        ? 'scale-[1.02] shadow-lg ring-2'
                        : 'hover:scale-[1.01]'
                    }`}
                    style={{
                      backgroundColor: cat.bgColor,
                      ...(category?.label === cat.label &&
                        ({ '--tw-ring-color': cat.color } as any)),
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-semibold" style={{ color: cat.color }}>
                        {cat.label}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-500">{cat.range}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Results - 3 cols */}
        <div className="space-y-6 lg:col-span-3">
          {/* BMI Display Card */}
          <div
            className="relative overflow-hidden rounded-3xl p-8 shadow-xl"
            style={{
              background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
            }}
          >
            {/* Decorative circles */}
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-black/5" />
            <div className="absolute -bottom-16 -left-16 h-32 w-32 rounded-full bg-white/10" />

            <div className="relative">
              <div className="mb-6 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-gray-700/60" />
                <span className="text-sm font-semibold uppercase tracking-wider text-gray-700/60">
                  Your BMI
                </span>
              </div>

              {/* Big BMI Number */}
              <div className="mb-8 text-center">
                <div
                  className={`inline-block transition-transform duration-500 ${isAnimating ? 'scale-110' : 'scale-100'}`}
                >
                  <span className="text-8xl font-semibold text-gray-900">
                    {bmi ? bmi.toFixed(1) : '--'}
                  </span>
                </div>
                {category && (
                  <div className="mt-4">
                    <span
                      className="inline-flex items-center gap-2 rounded-full px-6 py-2 text-lg font-semibold shadow-lg"
                      style={{ backgroundColor: category.bgColor, color: category.color }}
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Gauge */}
              <div className="relative mx-auto max-w-md">
                <div className="h-4 overflow-hidden rounded-full bg-gradient-to-r from-blue-400 via-amber-400 via-emerald-400 to-red-400">
                  <div className="h-full rounded-full bg-white/30" />
                </div>
                {bmi && (
                  <div
                    className="absolute -top-1 h-6 w-1 rounded-full bg-gray-900 shadow-lg transition-all duration-700 ease-out"
                    style={{ left: `calc(${gaugePosition}% - 2px)` }}
                  />
                )}
                <div className="mt-2 flex justify-between text-xs font-semibold text-gray-700/60">
                  <span>15</span>
                  <span>20</span>
                  <span>25</span>
                  <span>30</span>
                  <span>40</span>
                </div>
              </div>
            </div>
          </div>

          {/* Ideal Weight Card */}
          {idealWeight && (
            <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
              <div className="border-b border-gray-100 p-6">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Target className="h-5 w-5" style={{ color: primaryColor }} />
                  Your Healthy Weight Range
                </h3>
                <p className="mt-1 text-sm text-gray-500">Based on BMI 18.5 - 24.9</p>
              </div>

              <div className="p-6">
                <div className="mb-6 flex items-center justify-center gap-8">
                  <div className="text-center">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Minimum
                    </p>
                    <p className="text-4xl font-semibold" style={{ color: primaryColor }}>
                      {idealWeight.min}
                    </p>
                    <p className="text-sm font-medium text-gray-500">lbs</p>
                  </div>
                  <div className="text-4xl font-light text-gray-300">—</div>
                  <div className="text-center">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Maximum
                    </p>
                    <p className="text-4xl font-semibold" style={{ color: primaryColor }}>
                      {idealWeight.max}
                    </p>
                    <p className="text-sm font-medium text-gray-500">lbs</p>
                  </div>
                </div>

                {/* Status Message */}
                {bmi && (
                  <div
                    className={`flex items-center gap-4 rounded-2xl p-5 ${
                      weightToLose > 0
                        ? 'bg-amber-50'
                        : parseFloat(weight) < idealWeight.min
                          ? 'bg-blue-50'
                          : 'bg-emerald-50'
                    }`}
                  >
                    {weightToLose > 0 ? (
                      <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
                          <TrendingDown className="h-6 w-6 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-amber-900">
                            {weightToLose.toFixed(0)} lbs to healthy range
                          </p>
                          <p className="text-sm text-amber-700">
                            GLP-1 medications can help you reach your goal safely
                          </p>
                        </div>
                      </>
                    ) : parseFloat(weight) < idealWeight.min ? (
                      <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                          <Info className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-blue-900">
                            {(idealWeight.min - parseFloat(weight)).toFixed(0)} lbs below range
                          </p>
                          <p className="text-sm text-blue-700">
                            Consult with your provider about healthy weight gain
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
                          <Sparkles className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-emerald-900">
                            You're in a healthy range!
                          </p>
                          <p className="text-sm text-emerald-700">
                            Keep maintaining your current lifestyle
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info Card */}
          <div className="rounded-3xl border-2 border-gray-100 bg-gradient-to-br from-gray-50 to-white p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                <Info className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-gray-900">What is BMI?</h3>
                <p className="text-sm leading-relaxed text-gray-600">
                  Body Mass Index (BMI) is a measure of body fat based on height and weight. While
                  useful as a screening tool, it doesn't account for muscle mass, bone density, or
                  fat distribution. Always consult your healthcare provider for a complete
                  assessment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
