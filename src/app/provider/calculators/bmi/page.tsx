'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Scale,
  Info,
  Copy,
  Check,
  TrendingDown,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  calculateBMI,
  calculateBMIMetric,
  getBMICategory,
  calculateIdealBodyWeight,
  calculateIdealWeightRange,
  getICD10Codes,
  calculateWeightToLose,
  feetInchesToInches,
  lbsToKg,
  inchesToCm,
  BMI_CATEGORIES,
  type BMICategoryInfo,
  type ICD10Code,
} from '@/lib/calculators';

type UnitSystem = 'imperial' | 'metric';

export default function ProviderBMICalculatorPage() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');
  const [sex, setSex] = useState<'male' | 'female'>('female');
  
  // Imperial inputs
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  
  // Metric inputs
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const result = useMemo(() => {
    let bmi: number;
    let heightInches: number;
    let weightPounds: number;

    if (unitSystem === 'imperial') {
      const feetNum = parseInt(feet || '0');
      const inchesNum = parseInt(inches || '0');
      heightInches = feetInchesToInches(feetNum, inchesNum);
      weightPounds = parseFloat(weightLbs || '0');
      
      if (heightInches <= 0 || weightPounds <= 0) return null;
      
      bmi = calculateBMI(weightPounds, heightInches);
    } else {
      const cm = parseFloat(heightCm || '0');
      const kg = parseFloat(weightKg || '0');
      
      if (cm <= 0 || kg <= 0) return null;
      
      bmi = calculateBMIMetric(kg, cm);
      heightInches = cm / 2.54;
      weightPounds = kg * 2.20462;
    }

    const category = getBMICategory(bmi);
    const idealRange = calculateIdealWeightRange(heightInches);
    const idealWeight = calculateIdealBodyWeight(heightInches, sex);
    const weightToLose = calculateWeightToLose(weightPounds, heightInches);
    const icd10Codes = getICD10Codes(bmi);

    return {
      bmi,
      category,
      idealRange,
      idealWeight,
      weightToLose,
      icd10Codes,
      heightInches,
      weightPounds,
    };
  }, [unitSystem, feet, inches, weightLbs, heightCm, weightKg, sex]);

  const copyToClipboard = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getBMIGaugeRotation = (bmi: number): number => {
    // Map BMI 15-45 to -90 to 90 degrees
    const minBMI = 15;
    const maxBMI = 45;
    const clampedBMI = Math.max(minBMI, Math.min(maxBMI, bmi));
    return ((clampedBMI - minBMI) / (maxBMI - minBMI)) * 180 - 90;
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
        <h1 className="text-2xl font-bold text-gray-900">BMI Calculator</h1>
        <p className="text-gray-500 mt-1">
          Calculate Body Mass Index with clinical documentation support
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Unit Toggle */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Measurements</h2>
              <div className="flex rounded-xl bg-gray-100 p-1">
                <button
                  onClick={() => setUnitSystem('imperial')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    unitSystem === 'imperial'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Imperial
                </button>
                <button
                  onClick={() => setUnitSystem('metric')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    unitSystem === 'metric'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Metric
                </button>
              </div>
            </div>

            {/* Sex Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Biological Sex (for ideal weight calculation)
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setSex('female')}
                  className={`flex-1 rounded-xl px-4 py-3 font-medium transition-all border-2 ${
                    sex === 'female'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Female
                </button>
                <button
                  onClick={() => setSex('male')}
                  className={`flex-1 rounded-xl px-4 py-3 font-medium transition-all border-2 ${
                    sex === 'male'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Male
                </button>
              </div>
            </div>

            {unitSystem === 'imperial' ? (
              <>
                {/* Height - Imperial */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Height
                  </label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={feet}
                        onChange={(e) => setFeet(e.target.value)}
                        placeholder="5"
                        min="3"
                        max="8"
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
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
                        placeholder="6"
                        min="0"
                        max="11"
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                        in
                      </span>
                    </div>
                  </div>
                </div>

                {/* Weight - Imperial */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weight
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={weightLbs}
                      onChange={(e) => setWeightLbs(e.target.value)}
                      placeholder="180"
                      min="50"
                      max="800"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                      lbs
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Height - Metric */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Height
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      placeholder="170"
                      min="100"
                      max="250"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                      cm
                    </span>
                  </div>
                </div>

                {/* Weight - Metric */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weight
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      placeholder="80"
                      min="30"
                      max="400"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                      kg
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* BMI Categories Reference */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">BMI Classification Reference</h2>
            <div className="space-y-2">
              {BMI_CATEGORIES.map((cat) => (
                <div
                  key={cat.category}
                  className={`flex items-center justify-between p-3 rounded-xl ${
                    result?.category.category === cat.category
                      ? 'bg-gray-100 ring-2 ring-gray-900'
                      : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-medium text-gray-900">{cat.label}</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {cat.range.min === 0 ? '<' : ''}{cat.range.min !== 0 ? cat.range.min : cat.range.max}
                    {cat.range.max < 100 ? ` - ${cat.range.max}` : '+'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {/* BMI Result Card */}
          <div
            className="rounded-2xl p-6 text-center"
            style={{
              backgroundColor: result?.category.color || '#E5E7EB',
              color: result ? '#fff' : '#6B7280',
            }}
          >
            <Scale className="mx-auto mb-3 h-10 w-10 opacity-80" />
            <p className="text-sm font-medium opacity-80 mb-1">Body Mass Index</p>
            <p className="text-6xl font-bold mb-2">{result?.bmi.toFixed(1) || '--'}</p>
            <p className="text-lg font-medium opacity-90">
              {result?.category.label || 'Enter measurements'}
            </p>
          </div>

          {result && (
            <>
              {/* Clinical Notes */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-blue-50">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Clinical Notes</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {result.category.clinicalNotes}
                    </p>
                  </div>
                </div>
              </div>

              {/* ICD-10 Codes */}
              {result.icd10Codes.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    Suggested ICD-10 Codes
                  </h3>
                  <div className="space-y-2">
                    {result.icd10Codes.map((code) => (
                      <div
                        key={code.code}
                        className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div>
                          <span className="font-mono font-semibold text-gray-900">
                            {code.code}
                          </span>
                          <p className="text-sm text-gray-500">{code.description}</p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(code.code)}
                          className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          {copiedCode === code.code ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weight Goals */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-green-600" />
                  Weight Analysis
                </h3>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-gray-50">
                    <p className="text-sm text-gray-500 mb-1">Healthy Weight Range</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {result.idealRange.min} - {result.idealRange.max} lbs
                    </p>
                    <p className="text-sm text-gray-500">
                      ({Math.round(result.idealRange.min * 0.453592)} - {Math.round(result.idealRange.max * 0.453592)} kg)
                    </p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-gray-50">
                    <p className="text-sm text-gray-500 mb-1">Ideal Body Weight (Devine)</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {result.idealWeight} lbs
                    </p>
                    <p className="text-sm text-gray-500">
                      ({Math.round(result.idealWeight * 0.453592)} kg)
                    </p>
                  </div>

                  {result.weightToLose > 0 && (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-sm text-amber-700 mb-1">Weight to Reach BMI 25</p>
                      <p className="text-xl font-semibold text-amber-900">
                        {result.weightToLose} lbs to lose
                      </p>
                      <p className="text-sm text-amber-700">
                        ({Math.round(result.weightToLose * 0.453592)} kg)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Formula Card */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3">Formula</h3>
                <div className="p-4 rounded-xl bg-gray-50 font-mono text-sm">
                  <p className="text-gray-600 mb-2">BMI = weight (lb) / [height (in)]² × 703</p>
                  <p className="text-gray-900">
                    = {Math.round(result.weightPounds)} / ({Math.round(result.heightInches)}² × 703)
                  </p>
                  <p className="text-gray-900 font-semibold">= {result.bmi.toFixed(1)}</p>
                </div>
              </div>
            </>
          )}

          {/* Info Box */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <Info className="mb-2 h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900 mb-2">Clinical Considerations</h3>
            <p className="text-sm leading-relaxed text-blue-800">
              BMI may overestimate body fat in muscular individuals and underestimate it 
              in older adults or those with low muscle mass. Consider waist circumference 
              and body composition for a complete assessment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
