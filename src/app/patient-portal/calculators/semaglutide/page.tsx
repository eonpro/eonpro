'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { ArrowLeft, Syringe, Droplets, Check, ChevronRight } from 'lucide-react';

const SemaglutideSupportPanels = dynamic(
  () => import('@/components/patient-portal/calculators/SemaglutideSupportPanels'),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50">
            <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
            <div className="mt-4 h-4 w-full animate-pulse rounded bg-gray-100" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    ),
  },
);

const concentrations = [
  { value: 2.5, label: '2.5 mg/mL', color: '#3B82F6' },
  { value: 5, label: '5 mg/mL', color: '#10B981' },
  { value: 10, label: '10 mg/mL', color: '#8B5CF6' },
];

const dosingSchedule = [
  { week: '1-4', dose: 0.25, label: 'Weeks 1-4', desc: 'Starting dose' },
  { week: '5-8', dose: 0.5, label: 'Weeks 5-8', desc: 'First increase' },
  { week: '9-12', dose: 1.0, label: 'Weeks 9-12', desc: 'Building up' },
  { week: '13-16', dose: 1.7, label: 'Weeks 13-16', desc: 'Approaching target' },
  { week: '17+', dose: 2.4, label: 'Week 17+', desc: 'Maintenance dose' },
];

export default function SemaglutideDoseCalculatorPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const [units, setUnits] = useState('');
  const [concentration, setConcentration] = useState(5);
  const [selectedWeek, setSelectedWeek] = useState<(typeof dosingSchedule)[0] | null>(null);

  const result = useMemo(() => {
    const unitsNum = parseFloat(units || '0');
    if (unitsNum <= 0 || concentration <= 0) return null;
    const mL = unitsNum / 100;
    const mg = mL * concentration;
    return { mg: mg.toFixed(3), mL: mL.toFixed(3) };
  }, [units, concentration]);

  const fillPercentage = Math.min(100, (parseFloat(units || '0') / 100) * 100);

  return (
    <div className="min-h-[100dvh] px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`${PATIENT_PORTAL_PATH}/calculators`}
          className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Tools
        </Link>
        <h1 className="text-3xl font-semibold text-gray-900">Dose Calculator</h1>
        <p className="mt-2 text-gray-500">
          Convert units to milligrams for your Semaglutide injection
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left Column - Calculator */}
        <div className="space-y-6">
          {/* Concentration Selection */}
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
            <div className="border-b border-gray-100 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Droplets className="h-5 w-5" style={{ color: primaryColor }} />
                Vial Concentration
              </h2>
              <p className="mt-1 text-sm text-gray-500">Select your medication strength</p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-3 gap-3">
                {concentrations.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setConcentration(c.value)}
                    className={`group relative overflow-hidden rounded-2xl border-2 p-5 text-center transition-colors duration-200 ${
                      concentration === c.value
                        ? 'border-gray-900 bg-gray-900 shadow-xl'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white'
                    }`}
                  >
                    <div
                      className={`mb-2 text-3xl font-semibold ${concentration === c.value ? 'text-white' : 'text-gray-900'}`}
                    >
                      {c.value}
                    </div>
                    <div
                      className={`text-sm font-medium ${concentration === c.value ? 'text-gray-300' : 'text-gray-500'}`}
                    >
                      mg/mL
                    </div>
                    {concentration === c.value && (
                      <div className="absolute right-2 top-2">
                        <Check className="h-5 w-5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Units Input with Syringe Visual */}
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
            <div className="border-b border-gray-100 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Syringe className="h-5 w-5" style={{ color: primaryColor }} />
                Enter Units
              </h2>
            </div>

            <div className="p-6">
              <div className="relative mb-8">
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={units}
                  onChange={(e) => {
                    setUnits(e.target.value);
                    setSelectedWeek(null);
                  }}
                  placeholder="0"
                  min="0"
                  max="100"
                  step="1"
                  className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 py-5 text-center text-4xl font-semibold text-gray-900 outline-none transition-all placeholder:text-gray-300 focus:border-gray-900 focus:bg-white focus:shadow-lg sm:py-6 sm:text-5xl"
                  style={{ fontSize: '36px' }} // Prevent iOS zoom
                />
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-semibold uppercase tracking-wider text-gray-400 sm:bottom-2 sm:text-sm">
                  insulin units
                </span>
              </div>

              {/* Syringe Visualization */}
              <div className="w-full py-6">
                <svg
                  viewBox="0 0 400 140"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full"
                  role="img"
                  aria-label={`Syringe showing ${units || 0} units`}
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
                      <stop offset="0%" stopColor={`${accentColor}88`} />
                      <stop offset="50%" stopColor={accentColor} />
                      <stop offset="100%" stopColor={`${accentColor}cc`} />
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
                      <rect x="92" y="38" width="186" height="54" rx="5" />
                    </clipPath>
                    <filter id="syrShadow" x="-3%" y="-8%" width="106%" height="125%">
                      <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#000" floodOpacity="0.07" />
                    </filter>
                  </defs>

                  {/* Plunger rod — drawn first (behind barrel) */}
                  <rect
                    x="100"
                    y="59"
                    width="272"
                    height="12"
                    rx="2.5"
                    fill="url(#syrMetal)"
                    stroke="#c0c5cc"
                    strokeWidth="0.5"
                  />
                  {/* Grip ridges on rod */}
                  {[0, 6, 12].map((d) => (
                    <line
                      key={d}
                      x1={350 + d}
                      y1="60"
                      x2={350 + d}
                      y2="70"
                      stroke="#b0b6be"
                      strokeWidth="0.8"
                      strokeLinecap="round"
                    />
                  ))}

                  {/* Thumb rest */}
                  <rect x="370" y="52" width="10" height="26" rx="3" fill="url(#syrMetal)" stroke="#b0b6be" strokeWidth="0.8" />
                  <rect x="378" y="47" width="8" height="36" rx="4" fill="url(#syrMetal)" stroke="#b0b6be" strokeWidth="0.8" />

                  {/* Barrel body */}
                  <rect
                    x="90"
                    y="35"
                    width="190"
                    height="60"
                    rx="7"
                    fill="url(#syrGlass)"
                    stroke="#c5c9d0"
                    strokeWidth="1.2"
                    filter="url(#syrShadow)"
                  />

                  {/* Glass highlight streak */}
                  <rect x="100" y="40" width="170" height="5" rx="2.5" fill="white" opacity="0.55" />

                  {/* Liquid fill */}
                  <g clipPath="url(#syrClip)">
                    <rect
                      x="92"
                      y="38"
                      width="186"
                      height="54"
                      rx="5"
                      fill="url(#syrLiquid)"
                      opacity="0.65"
                      style={{
                        transformOrigin: '92px 65px',
                        transform: `scaleX(${fillPercentage / 100})`,
                        transition: 'transform 700ms ease-out',
                      }}
                    />
                  </g>

                  {/* Stopper (rubber gasket) */}
                  <g
                    style={{
                      transform: `translateX(${186 * (fillPercentage / 100)}px)`,
                      transition: 'transform 700ms ease-out',
                    }}
                  >
                    <rect x="90" y="37" width="9" height="56" rx="2" fill="url(#syrRubber)" />
                    <line x1="93" y1="40" x2="93" y2="90" stroke="#6b7280" strokeWidth="0.5" opacity="0.35" />
                    <line x1="96" y1="40" x2="96" y2="90" stroke="#6b7280" strokeWidth="0.5" opacity="0.35" />
                  </g>

                  {/* Measurement ticks & labels */}
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((mark) => {
                    const x = 94 + (182 * mark) / 100;
                    const isMajor = mark % 50 === 0;
                    const tickLen = isMajor ? 10 : 6;
                    return (
                      <g key={mark}>
                        <line
                          x1={x} y1={35} x2={x} y2={35 + tickLen}
                          stroke={isMajor ? '#6b7280' : '#b0b6be'}
                          strokeWidth={isMajor ? 1.2 : 0.7}
                          strokeLinecap="round"
                        />
                        <line
                          x1={x} y1={95} x2={x} y2={95 - tickLen}
                          stroke={isMajor ? '#6b7280' : '#b0b6be'}
                          strokeWidth={isMajor ? 1.2 : 0.7}
                          strokeLinecap="round"
                        />
                        {isMajor && (
                          <text
                            x={x} y={112}
                            textAnchor="middle"
                            fill="#6b7280"
                            fontSize="11"
                            fontWeight="600"
                            fontFamily="system-ui, sans-serif"
                            className="select-none"
                          >
                            {mark}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Hub connector (barrel to needle) */}
                  <path
                    d="M 90 48 L 74 56 L 74 74 L 90 82 Z"
                    fill="url(#syrHub)"
                    stroke="#adb3bc"
                    strokeWidth="0.8"
                    strokeLinejoin="round"
                  />
                  <line x1="82" y1="53" x2="82" y2="77" stroke="#b8bfc8" strokeWidth="0.6" opacity="0.5" />

                  {/* Needle shaft */}
                  <rect x="14" y="63" width="62" height="4" rx="1.5" fill="url(#syrNeedle)" />
                  {/* Needle bevel tip */}
                  <polygon points="14,63 5,65 14,67" fill="#a0a8b2" />

                  {/* Finger flange */}
                  <rect
                    x="280"
                    y="24"
                    width="5"
                    height="82"
                    rx="2.5"
                    fill="#d4d8de"
                    stroke="#b8bfc8"
                    strokeWidth="0.6"
                  />

                  {/* "UNITS" label */}
                  <text
                    x="185" y="132"
                    textAnchor="middle"
                    fill="#b0b6be"
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                    letterSpacing="0.1em"
                    className="select-none"
                  >
                    UNITS
                  </text>
                </svg>
              </div>
            </div>
          </div>

          {/* Quick Dose Selection */}
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
            <div className="border-b border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900">Or Select Your Week</h2>
              <p className="mt-1 text-sm text-gray-500">Auto-calculates units for your dose</p>
            </div>

            <div className="divide-y divide-gray-100">
              {dosingSchedule.map((schedule, i) => {
                const scheduleUnits = Math.round((schedule.dose / concentration) * 100 * 10) / 10;
                const isSelected = selectedWeek?.week === schedule.week;
                return (
                  <button
                    key={schedule.week}
                    onClick={() => {
                      setSelectedWeek(schedule);
                      setUnits(scheduleUnits.toString());
                    }}
                    className={`group flex w-full items-center justify-between p-5 text-left transition-colors duration-150 ${
                      isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl font-semibold transition-all ${
                          isSelected
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                        }`}
                      >
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{schedule.label}</p>
                        <p className="text-sm text-gray-500">{schedule.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900">{schedule.dose} mg</p>
                        <p className="text-sm font-medium text-gray-500">{scheduleUnits} units</p>
                      </div>
                      <ChevronRight
                        className={`h-5 w-5 transition-transform ${isSelected ? 'text-gray-900' : 'text-gray-300 group-hover:translate-x-1'}`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column - Results */}
        <div className="space-y-6">
          {/* Main Result Card */}
          <div
            className="relative overflow-hidden rounded-3xl p-8 shadow-xl"
            style={{
              background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
            }}
          >
            {/* Decorative elements */}
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-black/5" />
            <div className="absolute -bottom-16 -left-16 h-32 w-32 rounded-full bg-white/10" />

            <div className="relative">
              <div className="mb-6 flex items-center gap-2">
                <Syringe className="h-5 w-5 text-gray-700/60" />
                <span className="text-sm font-semibold uppercase tracking-wider text-gray-700/60">
                  Your Dose
                </span>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/40 p-6 backdrop-blur-sm">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
                    Units
                  </p>
                  <p className="text-5xl font-semibold text-gray-900">{units || '0'}</p>
                </div>
                <div className="rounded-2xl bg-white/40 p-6 backdrop-blur-sm">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
                    Milligrams
                  </p>
                  <p className="text-5xl font-semibold text-gray-900">{result?.mg || '0'}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-white/30 p-5 text-center backdrop-blur-sm">
                <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-600">
                  Volume to Inject
                </p>
                <p className="text-4xl font-semibold text-gray-900">{result?.mL || '0'} mL</p>
              </div>
            </div>
          </div>

          <SemaglutideSupportPanels
            units={units}
            concentration={concentration}
            result={result}
            primaryColor={primaryColor}
          />
        </div>
      </div>
    </div>
  );
}
