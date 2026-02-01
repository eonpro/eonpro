'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { ArrowLeft, Info, AlertTriangle, Syringe, ChevronRight, Check } from 'lucide-react';

// Tirzepatide concentration options
const concentrations = [
  { value: 5, label: '5 mg/mL' },
  { value: 10, label: '10 mg/mL' },
  { value: 15, label: '15 mg/mL' },
  { value: 20, label: '20 mg/mL' },
];

// Standard dosing schedule for Tirzepatide
const dosingSchedule = [
  { week: '1-4', dose: 2.5, label: 'Weeks 1-4' },
  { week: '5-8', dose: 5, label: 'Weeks 5-8' },
  { week: '9-12', dose: 7.5, label: 'Weeks 9-12' },
  { week: '13-16', dose: 10, label: 'Weeks 13-16' },
  { week: '17-20', dose: 12.5, label: 'Weeks 17-20' },
  { week: '21+', dose: 15, label: 'Maintenance' },
];

export default function TirzepatideDoseCalculatorPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const [units, setUnits] = useState('');
  const [concentration, setConcentration] = useState(10);
  const [selectedWeek, setSelectedWeek] = useState<(typeof dosingSchedule)[0] | null>(null);

  const result = useMemo(() => {
    const unitsNum = parseFloat(units || '0');
    if (unitsNum <= 0 || concentration <= 0) return null;

    // Convert units to mg
    // Insulin syringes: 100 units = 1 mL
    const mL = unitsNum / 100;
    const mg = mL * concentration;

    return {
      mg: mg.toFixed(2),
      mL: mL.toFixed(3),
    };
  }, [units, concentration]);

  // Syringe visual fill percentage (max 100 units)
  const fillPercentage = Math.min(100, (parseFloat(units || '0') / 100) * 100);

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/patient-portal/calculators"
          className="mb-2 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Calculators
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Tirzepatide Dose Calculator</h1>
        <p className="mt-1 text-gray-500">Convert units to mg for your injection</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calculator */}
        <div className="space-y-6">
          {/* Concentration Selection */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Vial Concentration</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {concentrations.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setConcentration(c.value)}
                  className={`rounded-xl px-3 py-3 text-sm font-medium transition-all ${
                    concentration === c.value
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={concentration === c.value ? { backgroundColor: '#3B82F6' } : {}}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Units Input */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Enter Units</h2>
            <div className="relative">
              <input
                type="number"
                value={units}
                onChange={(e) => {
                  setUnits(e.target.value);
                  setSelectedWeek(null);
                }}
                placeholder="0"
                min="0"
                max="100"
                step="1"
                className="w-full rounded-xl border border-gray-200 px-4 py-4 pr-16 text-center text-3xl font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-medium text-gray-400">
                units
              </span>
            </div>

            {/* Syringe Visualization */}
            <div className="mt-6 flex items-center justify-center">
              <div className="relative">
                {/* Syringe body */}
                <div className="relative h-48 w-12 overflow-hidden rounded-lg border-2 border-gray-300 bg-gray-100">
                  {/* Fill */}
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-b-md bg-blue-400 transition-all duration-500 ease-out"
                    style={{ height: `${fillPercentage}%` }}
                  />
                  {/* Measurement lines */}
                  {[0, 20, 40, 60, 80, 100].map((mark) => (
                    <div
                      key={mark}
                      className="absolute left-0 right-0 flex items-center"
                      style={{ bottom: `${mark}%` }}
                    >
                      <div className="h-0.5 w-2 bg-gray-400" />
                      <span className="ml-1 text-[8px] text-gray-500">{mark}</span>
                    </div>
                  ))}
                </div>
                {/* Plunger */}
                <div
                  className="absolute left-1/2 w-8 -translate-x-1/2 rounded-t-lg bg-gray-400 transition-all duration-500"
                  style={{
                    bottom: `calc(${fillPercentage}% + 192px)`,
                    height: `calc(100% - ${fillPercentage}%)`,
                  }}
                />
                {/* Needle */}
                <div className="absolute -bottom-8 left-1/2 h-8 w-0.5 -translate-x-1/2 bg-gray-400" />
                <div className="absolute -bottom-10 left-1/2 h-2 w-1 -translate-x-1/2 rounded-b-sm bg-gray-500" />
              </div>
            </div>
          </div>

          {/* Quick Dose Selection */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Or Select Your Dose Week</h2>
            <div className="space-y-2">
              {dosingSchedule.map((schedule) => (
                <button
                  key={schedule.week}
                  onClick={() => {
                    setSelectedWeek(schedule);
                    const mL = schedule.dose / concentration;
                    const calculatedUnits = Math.round(mL * 100 * 10) / 10;
                    setUnits(calculatedUnits.toString());
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border-2 p-4 transition-all ${
                    selectedWeek?.week === schedule.week
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{schedule.label}</p>
                    <p className="text-sm text-gray-500">{schedule.dose} mg</p>
                  </div>
                  <span className="rounded-lg bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                    {Math.round((schedule.dose / concentration) * 100 * 10) / 10} units
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-6">
          {/* Conversion Result */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white">
            <h2 className="mb-4 font-semibold text-white/90">Your Dose</h2>

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/20 p-4 text-center backdrop-blur">
                <p className="mb-1 text-sm font-medium text-white/80">Units</p>
                <p className="text-4xl font-semibold text-white">{units || '0'}</p>
              </div>
              <div className="rounded-xl bg-white/20 p-4 text-center backdrop-blur">
                <p className="mb-1 text-sm font-medium text-white/80">Milligrams</p>
                <p className="text-4xl font-semibold text-white">{result?.mg || '0'}</p>
              </div>
            </div>

            <div className="rounded-xl bg-white/15 p-4 text-center backdrop-blur">
              <p className="text-sm font-medium text-white/80">Volume</p>
              <p className="text-2xl font-semibold text-white">{result?.mL || '0'} mL</p>
            </div>
          </div>

          {/* Conversion Formula */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-900">How It Works</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                <span className="rounded bg-white px-2 py-1 font-mono text-gray-700">
                  100 units = 1 mL
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                <span className="rounded bg-white px-2 py-1 font-mono text-gray-700">
                  1 mL × {concentration} mg/mL = {concentration} mg
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
                <span className="rounded bg-blue-100 px-2 py-1 font-mono text-blue-700">
                  {units || '0'} units ÷ 100 × {concentration} = {result?.mg || '0'} mg
                </span>
              </div>
            </div>
          </div>

          {/* Dosing Guide */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-900">Standard Titration Schedule</h3>
            <div className="space-y-2">
              {dosingSchedule.map((s) => (
                <div
                  key={s.week}
                  className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-0"
                >
                  <span className="text-gray-600">{s.label}</span>
                  <span className="font-semibold text-gray-900">{s.dose} mg</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tirzepatide vs Semaglutide Info */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
              <div>
                <h3 className="mb-1 font-semibold text-blue-900">About Tirzepatide</h3>
                <p className="text-sm leading-relaxed text-blue-800">
                  Tirzepatide (Mounjaro, Zepbound) is a dual GIP/GLP-1 receptor agonist. It
                  typically starts at 2.5 mg weekly and can be titrated up to 15 mg based on your
                  provider's guidance.
                </p>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <h3 className="mb-1 font-semibold text-amber-900">Important</h3>
                <p className="text-sm leading-relaxed text-amber-800">
                  This calculator is for reference only. Always follow your provider's specific
                  dosing instructions. Contact your healthcare provider if you have any questions
                  about your dose.
                </p>
              </div>
            </div>
          </div>

          {/* Injection Tracker Link */}
          <Link
            href="/patient-portal/tools/injection-tracker"
            className="block rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <Syringe className="h-6 w-6" style={{ color: primaryColor }} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Injection Site Tracker</h3>
                <p className="text-sm text-gray-500">Track and rotate your injection sites</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>
          </Link>

          {/* Storage Tips */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: `${primaryColor}08` }}>
            <h3 className="mb-3 font-semibold text-gray-900">Storage Instructions</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: primaryColor }} />
                Store in refrigerator at 36°F to 46°F (2°C to 8°C)
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: primaryColor }} />
                Can be stored at room temp up to 86°F for 21 days after first use
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: primaryColor }} />
                Do not freeze and protect from light
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: primaryColor }} />
                Let medication reach room temperature (~30 min) before injecting
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
