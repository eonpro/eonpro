'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Heart,
  AlertTriangle,
  Info,
  TrendingDown,
  Shield,
  Stethoscope,
  Copy,
  Check,
} from 'lucide-react';
import {
  analyzeASCVDRisk,
  validateASCVDInput,
  RISK_CATEGORIES,
  RISK_ENHANCING_FACTORS,
  type ASCVDInput,
  type RiskCategoryInfo,
} from '@/lib/calculators';

export default function ProviderASCVDCalculatorPage() {
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [race, setRace] = useState<'white' | 'african_american' | 'other'>('white');
  const [totalCholesterol, setTotalCholesterol] = useState('');
  const [hdlCholesterol, setHdlCholesterol] = useState('');
  const [systolicBP, setSystolicBP] = useState('');
  const [onHypertensionTreatment, setOnHypertensionTreatment] = useState(false);
  const [hasDiabetes, setHasDiabetes] = useState(false);
  const [isSmoker, setIsSmoker] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const input: Partial<ASCVDInput> = useMemo(() => ({
    age: parseInt(age) || undefined,
    sex,
    race,
    totalCholesterol: parseInt(totalCholesterol) || undefined,
    hdlCholesterol: parseInt(hdlCholesterol) || undefined,
    systolicBP: parseInt(systolicBP) || undefined,
    onHypertensionTreatment,
    hasDiabetes,
    isSmoker,
  }), [age, sex, race, totalCholesterol, hdlCholesterol, systolicBP, onHypertensionTreatment, hasDiabetes, isSmoker]);

  const validation = useMemo(() => validateASCVDInput(input), [input]);

  const result = useMemo(() => {
    if (!validation.valid) return null;
    return analyzeASCVDRisk(input as ASCVDInput);
  }, [input, validation]);

  const getCategoryInfo = (category: string): RiskCategoryInfo => {
    return RISK_CATEGORIES.find(c => c.category === category) || RISK_CATEGORIES[0];
  };

  const getRiskGaugeRotation = (risk: number): number => {
    // Map 0-40% to -90 to 90 degrees
    const clampedRisk = Math.max(0, Math.min(40, risk));
    return (clampedRisk / 40) * 180 - 90;
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const generateDocumentation = () => {
    if (!result) return '';
    return `ASCVD 10-Year Risk Assessment
Risk: ${result.tenYearRisk}% (${result.riskCategoryLabel})
Optimal Risk: ${result.optimalRisk}%

Patient Data:
- Age: ${age} years
- Sex: ${sex}
- Race: ${race.replace('_', ' ')}
- Total Cholesterol: ${totalCholesterol} mg/dL
- HDL Cholesterol: ${hdlCholesterol} mg/dL
- Systolic BP: ${systolicBP} mmHg
- HTN Treatment: ${onHypertensionTreatment ? 'Yes' : 'No'}
- Diabetes: ${hasDiabetes ? 'Yes' : 'No'}
- Current Smoker: ${isSmoker ? 'Yes' : 'No'}

Statin Recommendation: ${result.statinRecommendation.rationale}`;
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
        <h1 className="text-2xl font-bold text-gray-900">ASCVD Risk Calculator</h1>
        <p className="text-gray-500 mt-1">
          10-Year Atherosclerotic Cardiovascular Disease Risk (2013 ACC/AHA Pooled Cohort Equations)
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Demographics */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Demographics</h2>
            
            <div className="grid md:grid-cols-3 gap-4">
              {/* Age */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Age (40-79)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="55"
                    min="40"
                    max="79"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-16 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    years
                  </span>
                </div>
              </div>

              {/* Sex */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sex at Birth
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSex('male')}
                    className={`flex-1 rounded-xl px-3 py-3 font-medium transition-all border-2 ${
                      sex === 'male'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Male
                  </button>
                  <button
                    onClick={() => setSex('female')}
                    className={`flex-1 rounded-xl px-3 py-3 font-medium transition-all border-2 ${
                      sex === 'female'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Female
                  </button>
                </div>
              </div>

              {/* Race */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Race
                </label>
                <select
                  value={race}
                  onChange={(e) => setRace(e.target.value as typeof race)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                >
                  <option value="white">White</option>
                  <option value="african_american">African American</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Lab Values */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Lipid Panel</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              {/* Total Cholesterol */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Cholesterol (130-320)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={totalCholesterol}
                    onChange={(e) => setTotalCholesterol(e.target.value)}
                    placeholder="200"
                    min="130"
                    max="320"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-20 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    mg/dL
                  </span>
                </div>
              </div>

              {/* HDL Cholesterol */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  HDL Cholesterol (20-100)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={hdlCholesterol}
                    onChange={(e) => setHdlCholesterol(e.target.value)}
                    placeholder="50"
                    min="20"
                    max="100"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-20 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    mg/dL
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Blood Pressure */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Blood Pressure</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              {/* Systolic BP */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Systolic BP (90-200)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={systolicBP}
                    onChange={(e) => setSystolicBP(e.target.value)}
                    placeholder="120"
                    min="90"
                    max="200"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-20 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    mmHg
                  </span>
                </div>
              </div>

              {/* HTN Treatment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  On BP Treatment?
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOnHypertensionTreatment(true)}
                    className={`flex-1 rounded-xl px-3 py-3 font-medium transition-all border-2 ${
                      onHypertensionTreatment
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setOnHypertensionTreatment(false)}
                    className={`flex-1 rounded-xl px-3 py-3 font-medium transition-all border-2 ${
                      !onHypertensionTreatment
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Factors */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Additional Risk Factors</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              {/* Diabetes */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50">
                <span className="font-medium text-gray-700">Diabetes</span>
                <button
                  onClick={() => setHasDiabetes(!hasDiabetes)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    hasDiabetes ? 'bg-red-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      hasDiabetes ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Smoker */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50">
                <span className="font-medium text-gray-700">Current Smoker</span>
                <button
                  onClick={() => setIsSmoker(!isSmoker)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isSmoker ? 'bg-red-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isSmoker ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Validation Errors */}
          {!validation.valid && validation.errors.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">Please correct the following:</p>
                  <ul className="mt-2 text-sm text-amber-800 list-disc list-inside">
                    {validation.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {/* Risk Result Card */}
          <div
            className="rounded-2xl p-6"
            style={{
              backgroundColor: result ? getCategoryInfo(result.riskCategory).color : '#E5E7EB',
              color: result ? '#fff' : '#6B7280',
            }}
          >
            <Heart className="mx-auto mb-3 h-10 w-10 opacity-80" />
            <p className="text-sm font-medium opacity-80 mb-1 text-center">10-Year ASCVD Risk</p>
            <p className="text-6xl font-bold mb-2 text-center">
              {result ? `${result.tenYearRisk}%` : '--'}
            </p>
            <p className="text-lg font-medium opacity-90 text-center">
              {result?.riskCategoryLabel || 'Enter patient data'}
            </p>
          </div>

          {result && (
            <>
              {/* Risk Comparison */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-green-600" />
                  Risk Comparison
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 rounded-xl bg-red-50">
                    <span className="text-gray-700">Current Risk</span>
                    <span className="font-bold text-red-600">{result.tenYearRisk}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-xl bg-green-50">
                    <span className="text-gray-700">Optimal Risk</span>
                    <span className="font-bold text-green-600">{result.optimalRisk}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-xl bg-blue-50">
                    <span className="text-gray-700">Potential Reduction</span>
                    <span className="font-bold text-blue-600">
                      {Math.round((result.tenYearRisk - result.optimalRisk) * 10) / 10}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Statin Recommendation */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-purple-600" />
                  Statin Recommendation
                </h3>
                <div
                  className={`p-4 rounded-xl ${
                    result.statinRecommendation.indicated
                      ? result.statinRecommendation.intensity === 'high'
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-amber-50 border border-amber-200'
                      : 'bg-green-50 border border-green-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Shield
                      className={`h-5 w-5 ${
                        result.statinRecommendation.indicated
                          ? result.statinRecommendation.intensity === 'high'
                            ? 'text-red-600'
                            : 'text-amber-600'
                          : 'text-green-600'
                      }`}
                    />
                    <span className="font-semibold capitalize">
                      {result.statinRecommendation.intensity === 'none'
                        ? 'Not Indicated'
                        : `${result.statinRecommendation.intensity}-Intensity Statin`}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">
                    {result.statinRecommendation.rationale}
                  </p>
                </div>
              </div>

              {/* Recommendations */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3">Lifestyle Recommendations</h3>
                <ul className="space-y-2">
                  {result.recommendations.slice(0, 5).map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Copy Documentation */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3">Documentation</h3>
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
                      Copy Risk Assessment
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Risk Categories Reference */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Risk Categories</h3>
            <div className="space-y-2">
              {RISK_CATEGORIES.map((cat) => (
                <div
                  key={cat.category}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    result?.riskCategory === cat.category ? 'bg-gray-100 ring-1 ring-gray-300' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm font-medium text-gray-900">{cat.label}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {cat.range.min < 1 ? '<' : ''}{cat.range.min}
                    {cat.range.max < 100 ? `-${cat.range.max}` : '+'}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <Info className="mb-2 h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900 mb-2">Clinical Note</h3>
            <p className="text-sm text-blue-800">
              This calculator uses the 2013 ACC/AHA Pooled Cohort Equations. Consider 
              risk-enhancing factors for patients with borderline or intermediate risk 
              when making treatment decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
