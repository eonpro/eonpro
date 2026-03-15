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

            {/* mL to mg display — always rendered to prevent CLS */}
            <div className={`mt-4 rounded-xl p-4 text-center ${selectedMl ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <p className={`text-sm ${selectedMl ? 'text-blue-700' : 'text-gray-400'}`}>
                {selectedMl || '—'} mL × {concentration} mg/mL ={' '}
                <span className="font-bold">{selectedMl ? selectedMl * concentration : '—'} mg</span>
              </p>
            </div>

            {/* Syringe Visualization */}
            <div className="w-full py-4">
              <svg
                viewBox="0 0 400 100"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full"
                role="img"
                aria-label={`Syringe showing ${selectedMl || 0} mL`}
              >
                <defs>
                  <linearGradient id="syrGlass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f0f2f5" />
                    <stop offset="15%" stopColor="#fafbfc" />
                    <stop offset="50%" stopColor="#ffffff" />
                    <stop offset="85%" stopColor="#f4f5f7" />
                    <stop offset="100%" stopColor="#e8eaed" />
                  </linearGradient>
                  <linearGradient id="syrLiquid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5e6a0" />
                    <stop offset="50%" stopColor="#e8c766" />
                    <stop offset="100%" stopColor="#d4ad3e" />
                  </linearGradient>
                  <linearGradient id="syrMetal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4d8de" />
                    <stop offset="30%" stopColor="#eceef1" />
                    <stop offset="70%" stopColor="#e6e8ec" />
                    <stop offset="100%" stopColor="#c5c9d0" />
                  </linearGradient>
                  <linearGradient id="syrNeedle" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d0d5db" />
                    <stop offset="50%" stopColor="#b8bfc8" />
                    <stop offset="100%" stopColor="#a0a8b2" />
                  </linearGradient>
                  <linearGradient id="syrRubber" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5a6270" />
                    <stop offset="50%" stopColor="#3d4450" />
                    <stop offset="100%" stopColor="#2a303a" />
                  </linearGradient>
                  <linearGradient id="syrHub" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dee1e6" />
                    <stop offset="50%" stopColor="#c5c9d0" />
                    <stop offset="100%" stopColor="#adb3bc" />
                  </linearGradient>
                  <clipPath id="syrClip">
                    <rect x="74" y="34" width="236" height="16" rx="3" />
                  </clipPath>
                  <filter id="syrShadow" x="-2%" y="-12%" width="104%" height="135%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.06" />
                  </filter>
                </defs>

                {/* Plunger rod (behind barrel) */}
                <rect x="100" y="40" width="248" height="5" rx="1.5" fill="url(#syrMetal)" stroke="#c0c5cc" strokeWidth="0.4" />
                {[0, 5, 10].map((d) => (
                  <line key={d} x1={330 + d} y1="40.5" x2={330 + d} y2="44.5" stroke="#b0b6be" strokeWidth="0.5" strokeLinecap="round" />
                ))}

                {/* Thumb rest */}
                <rect x="346" y="37.5" width="6" height="10" rx="2" fill="url(#syrMetal)" stroke="#b0b6be" strokeWidth="0.5" />
                <rect x="350" y="35" width="5" height="15" rx="2.5" fill="url(#syrMetal)" stroke="#b0b6be" strokeWidth="0.5" />

                {/* Barrel body */}
                <rect x="72" y="32" width="240" height="20" rx="4" fill="url(#syrGlass)" stroke="#c5c9d0" strokeWidth="1" filter="url(#syrShadow)" />
                <rect x="80" y="34" width="224" height="2.5" rx="1.25" fill="white" opacity="0.5" />

                {/* Liquid fill */}
                <g clipPath="url(#syrClip)">
                  <rect
                    x="74" y="34" width="236" height="16" rx="3"
                    fill="url(#syrLiquid)" opacity="0.55"
                    style={{
                      transformOrigin: '74px 42px',
                      transform: `scaleX(${fillPercentage / 100})`,
                      transition: 'transform 700ms ease-out',
                    }}
                  />
                </g>

                {/* Stopper */}
                <g style={{ transform: `translateX(${230 * (fillPercentage / 100)}px)`, transition: 'transform 700ms ease-out' }}>
                  <rect x="74" y="33" width="6" height="18" rx="1.5" fill="url(#syrRubber)" />
                  <line x1="76" y1="35" x2="76" y2="49" stroke="#6b7280" strokeWidth="0.3" opacity="0.3" />
                  <line x1="78" y1="35" x2="78" y2="49" stroke="#6b7280" strokeWidth="0.3" opacity="0.3" />
                </g>

                {/* mg indicator */}
                {result && fillPercentage > 0 && (
                  <g style={{ transform: `translateX(${230 * (fillPercentage / 100)}px)`, transition: 'transform 700ms ease-out' }}>
                    <line x1="77" y1="24" x2="77" y2="32" stroke="#c9a84c" strokeWidth="0.6" opacity="0.5" />
                    <rect x="58" y="11" width="38" height="14" rx="4" fill="#fef9eb" stroke="#e8c766" strokeWidth="0.6" />
                    <text x="77" y="21" textAnchor="middle" fill="#a8861e" fontSize="7" fontWeight="700" fontFamily="system-ui, sans-serif" className="select-none">
                      {result.mg} mg
                    </text>
                  </g>
                )}

                {/* Measurement ticks & labels */}
                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((mark) => {
                  const x = 76 + (230 * mark) / 100;
                  const isMajor = mark % 50 === 0;
                  const tickLen = isMajor ? 6 : 4;
                  return (
                    <g key={mark}>
                      <line x1={x} y1={32} x2={x} y2={32 + tickLen} stroke={isMajor ? '#6b7280' : '#b0b6be'} strokeWidth={isMajor ? 0.8 : 0.5} strokeLinecap="round" />
                      <line x1={x} y1={52} x2={x} y2={52 - tickLen} stroke={isMajor ? '#6b7280' : '#b0b6be'} strokeWidth={isMajor ? 0.8 : 0.5} strokeLinecap="round" />
                      {mark > 0 && (
                        <text x={x} y={64} textAnchor="middle" fill={isMajor ? '#6b7280' : '#9ca3af'} fontSize={isMajor ? '9' : '7.5'} fontWeight={isMajor ? '600' : '500'} fontFamily="system-ui, sans-serif" className="select-none">
                          {mark}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Hub connector */}
                <path d="M 72 36 L 62 39 L 62 45 L 72 48 Z" fill="url(#syrHub)" stroke="#adb3bc" strokeWidth="0.5" strokeLinejoin="round" />
                <line x1="67" y1="38" x2="67" y2="46" stroke="#b8bfc8" strokeWidth="0.4" opacity="0.4" />

                {/* Needle */}
                <rect x="42" y="41.2" width="22" height="1.6" rx="0.8" fill="url(#syrNeedle)" />
                <polygon points="42,41.2 38,42 42,42.8" fill="#a0a8b2" />

                {/* Finger flange */}
                <rect x="312" y="24" width="4" height="36" rx="2" fill="#d4d8de" stroke="#b8bfc8" strokeWidth="0.5" />

                {/* UNITS label */}
                <text x="190" y="77" textAnchor="middle" fill="#b0b6be" fontSize="7" fontWeight="600" fontFamily="system-ui, sans-serif" letterSpacing="0.1em" className="select-none">
                  UNITS
                </text>
              </svg>
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
