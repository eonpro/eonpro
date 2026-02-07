'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { ArrowLeft, Info, AlertTriangle, Syringe, ChevronRight, Check } from 'lucide-react';

// Tirzepatide concentration options (compounded)
const concentrations = [
  { value: 10, label: '10 mg/mL' },
  { value: 30, label: '30 mg/mL' },
];

// mL selection options
const ML_OPTIONS = [1, 2, 3, 4, 5];

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

  const [selectedMl, setSelectedMl] = useState<number | null>(null);
  const [concentration, setConcentration] = useState(10);
  const [selectedWeek, setSelectedWeek] = useState<(typeof dosingSchedule)[0] | null>(null);

  const result = useMemo(() => {
    if (!selectedMl || selectedMl <= 0 || concentration <= 0) return null;

    const mg = selectedMl * concentration;

    return {
      mg: mg.toFixed(0),
      mL: selectedMl,
    };
  }, [selectedMl, concentration]);

  // Syringe visual fill percentage (100 units = 1 mL = 100%)
  // For doses > 1 mL, shows full syringe (would need multiple draws)
  const fillPercentage = Math.min(100, (selectedMl || 0) * 100);

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
        <h1 className="text-2xl font-semibold text-gray-900">Tirzepatide Dose Calculator</h1>
        <p className="mt-1 text-gray-500">Select your mL volume to calculate your dose</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calculator */}
        <div className="space-y-6">
          {/* Concentration Selection */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Vial Concentration</h2>
            <div className="grid grid-cols-2 gap-3">
              {concentrations.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setConcentration(c.value)}
                  className={`rounded-xl px-4 py-4 text-center font-medium transition-all ${
                    concentration === c.value
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={concentration === c.value ? { backgroundColor: '#3B82F6' } : {}}
                >
                  <p className="text-2xl font-bold">{c.value}</p>
                  <p className="text-sm">mg/mL</p>
                </button>
              ))}
            </div>
          </div>

          {/* mL Selection */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Select Volume (mL)</h2>
            <div className="grid grid-cols-5 gap-2">
              {ML_OPTIONS.map((ml) => (
                <button
                  key={ml}
                  onClick={() => {
                    setSelectedMl(ml);
                    setSelectedWeek(null);
                  }}
                  className={`rounded-xl border-2 p-4 text-center transition-all ${
                    selectedMl === ml
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-2xl font-bold text-gray-900">{ml}</p>
                  <p className="text-xs text-gray-500">mL</p>
                </button>
              ))}
            </div>

            {/* mL to mg display */}
            {selectedMl && (
              <div className="mt-4 rounded-xl bg-blue-50 p-4 text-center">
                <p className="text-sm text-blue-700">
                  {selectedMl} mL × {concentration} mg/mL ={' '}
                  <span className="font-bold">{selectedMl * concentration} mg</span>
                </p>
              </div>
            )}

            {/* Realistic Syringe Visualization - 100 Units */}
            <div className="mt-6 flex items-center justify-center">
              <div className="relative">
                {/* Plunger handle */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 transition-all duration-500 ease-out"
                  style={{ bottom: `calc(${fillPercentage}% + 200px)` }}
                >
                  <div className="h-4 w-16 rounded-t-md bg-gradient-to-b from-gray-400 to-gray-500 shadow-md" />
                  <div className="mx-auto h-2 w-3 bg-gradient-to-b from-gray-500 to-gray-600" />
                </div>

                {/* Plunger rod */}
                <div
                  className="absolute left-1/2 w-2 -translate-x-1/2 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 transition-all duration-500 ease-out"
                  style={{
                    bottom: `calc(${fillPercentage}% + 6px)`,
                    height: `calc(200px - ${fillPercentage}% - 6px)`,
                    minHeight: '10px',
                  }}
                />

                {/* Plunger stopper (rubber) */}
                <div
                  className="absolute left-1/2 h-2 w-8 -translate-x-1/2 rounded-sm bg-gradient-to-b from-gray-700 to-gray-800 transition-all duration-500 ease-out"
                  style={{ bottom: `calc(${fillPercentage}%)` }}
                />

                {/* Syringe barrel */}
                <div className="relative h-[200px] w-12 overflow-hidden rounded-lg border-2 border-gray-300 bg-gradient-to-r from-gray-100 via-white to-gray-100 shadow-inner">
                  {/* Liquid fill */}
                  <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out"
                    style={{
                      height: `${fillPercentage}%`,
                      background:
                        'linear-gradient(to top, rgba(59, 130, 246, 0.6), rgba(96, 165, 250, 0.4))',
                    }}
                  />

                  {/* Unit markings - 100 units scale */}
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((mark) => (
                    <div
                      key={mark}
                      className="absolute right-0 flex items-center justify-end"
                      style={{ bottom: `${mark}%`, transform: 'translateY(50%)' }}
                    >
                      <span className="mr-1 text-[8px] font-medium text-gray-500">{mark}</span>
                      <div
                        className={`h-[1px] ${mark % 50 === 0 ? 'w-3 bg-gray-500' : mark % 10 === 0 ? 'w-2 bg-gray-400' : 'w-1 bg-gray-300'}`}
                      />
                    </div>
                  ))}

                  {/* Minor tick marks (every 5 units) */}
                  {[5, 15, 25, 35, 45, 55, 65, 75, 85, 95].map((mark) => (
                    <div
                      key={mark}
                      className="absolute right-0 flex items-center justify-end"
                      style={{ bottom: `${mark}%`, transform: 'translateY(50%)' }}
                    >
                      <div className="h-[1px] w-1.5 bg-gray-300" />
                    </div>
                  ))}

                  {/* Barrel flange (top) */}
                  <div className="absolute -left-1 -right-1 top-0 h-2 rounded-t bg-gradient-to-b from-gray-200 to-gray-300" />
                </div>

                {/* Needle hub (Luer lock) */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
                  <div className="h-3 w-6 rounded-b-sm bg-gradient-to-b from-gray-300 to-gray-400" />
                  <div className="mx-auto h-1 w-4 bg-gradient-to-b from-gray-400 to-gray-500" />
                </div>

                {/* Needle */}
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                  <div className="mx-auto h-6 w-[2px] bg-gradient-to-b from-gray-400 to-gray-500" />
                  <div
                    className="mx-auto h-2 w-[1px] bg-gray-500"
                    style={{
                      clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Units display below syringe */}
            <div className="mt-14 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {(selectedMl || 0) * 100} units ({selectedMl || 0} mL)
              </p>
            </div>
          </div>

          {/* Quick Dose Selection */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Or Select Your Dose Week</h2>
            <div className="space-y-2">
              {dosingSchedule.map((schedule) => {
                const scheduleMl = schedule.dose / concentration;
                return (
                  <button
                    key={schedule.week}
                    onClick={() => {
                      setSelectedWeek(schedule);
                      setSelectedMl(Math.round(scheduleMl * 10) / 10);
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
                      {scheduleMl.toFixed(2)} mL
                    </span>
                  </button>
                );
              })}
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
                <p className="mb-1 text-sm font-medium text-white/80">Volume</p>
                <p className="text-4xl font-semibold text-white">{selectedMl || '0'} mL</p>
              </div>
              <div className="rounded-xl bg-white/20 p-4 text-center backdrop-blur">
                <p className="mb-1 text-sm font-medium text-white/80">Milligrams</p>
                <p className="text-4xl font-semibold text-white">{result?.mg || '0'}</p>
              </div>
            </div>

            <div className="rounded-xl bg-white/15 p-4 text-center backdrop-blur">
              <p className="text-sm font-medium text-white/80">Total Dose</p>
              <p className="text-2xl font-semibold text-white">{result?.mg || '0'} mg</p>
            </div>
          </div>

          {/* Conversion Formula */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-900">How It Works</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                <span className="rounded bg-white px-2 py-1 font-mono text-gray-700">
                  mL × Concentration = Dose
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
                <span className="rounded bg-blue-100 px-2 py-1 font-mono text-blue-700">
                  {selectedMl || '0'} mL × {concentration} mg/mL = {result?.mg || '0'} mg
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3">
                <span className="rounded bg-green-100 px-2 py-1 font-mono text-green-700">
                  1 mL = {concentration} mg
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

          {/* Tirzepatide Info */}
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
            href={`${PATIENT_PORTAL_PATH}/tools/injection-tracker`}
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
