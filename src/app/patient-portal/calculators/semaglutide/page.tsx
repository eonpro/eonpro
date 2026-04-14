'use client';

import { useState, useMemo, useTransition, useCallback } from 'react';
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
  }
);

const concentrations = [
  {
    value: 2.5,
    label: '2.5 mg/mL',
    color: '#3B82F6',
    tag: 'Most Popular',
    tagColor: 'bg-amber-100 text-amber-700',
  },
  {
    value: 5,
    label: '5 mg/mL',
    color: '#10B981',
    tag: 'Highest Dose/mL',
    tagColor: 'bg-blue-100 text-blue-700',
  },
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
  const [concentration, setConcentration] = useState(2.5);
  const [selectedWeek, setSelectedWeek] = useState<(typeof dosingSchedule)[0] | null>(null);
  const [, startTransition] = useTransition();

  const handleUnitsChange = useCallback(
    (value: string) => {
      startTransition(() => {
        setUnits(value);
        setSelectedWeek(null);
      });
    },
    [startTransition]
  );

  const result = useMemo(() => {
    const unitsNum = parseFloat(units || '0');
    if (unitsNum <= 0 || concentration <= 0) return null;
    const mL = unitsNum / 100;
    const mg = mL * concentration;
    return { mg: mg.toFixed(3), mL: mL.toFixed(3) };
  }, [units, concentration]);

  const fillPercentage = useMemo(
    () => Math.min(100, (parseFloat(units || '0') / 100) * 100),
    [units]
  );

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
              <div className="grid grid-cols-2 gap-3">
                {concentrations.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setConcentration(c.value)}
                    className={`group relative overflow-hidden rounded-2xl border-2 p-5 pt-8 text-center transition-colors duration-200 ${
                      concentration === c.value
                        ? 'border-gray-900 bg-gray-900 shadow-xl'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white'
                    }`}
                  >
                    <span
                      className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        concentration === c.value ? 'bg-white/20 text-white' : c.tagColor
                      }`}
                    >
                      {c.tag}
                    </span>
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
                  onChange={(e) => handleUnitsChange(e.target.value)}
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
              <div className="w-full py-4">
                <svg
                  viewBox="0 0 400 100"
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
                      <feDropShadow
                        dx="0"
                        dy="1"
                        stdDeviation="1.5"
                        floodColor="#000"
                        floodOpacity="0.06"
                      />
                    </filter>
                  </defs>

                  {/* Plunger rod (behind barrel) */}
                  <rect
                    x="100"
                    y="40"
                    width="248"
                    height="5"
                    rx="1.5"
                    fill="url(#syrMetal)"
                    stroke="#c0c5cc"
                    strokeWidth="0.4"
                  />
                  {/* Grip ridges */}
                  {[0, 5, 10].map((d) => (
                    <line
                      key={d}
                      x1={330 + d}
                      y1="40.5"
                      x2={330 + d}
                      y2="44.5"
                      stroke="#b0b6be"
                      strokeWidth="0.5"
                      strokeLinecap="round"
                    />
                  ))}

                  {/* Thumb rest */}
                  <rect
                    x="346"
                    y="37.5"
                    width="6"
                    height="10"
                    rx="2"
                    fill="url(#syrMetal)"
                    stroke="#b0b6be"
                    strokeWidth="0.5"
                  />
                  <rect
                    x="350"
                    y="35"
                    width="5"
                    height="15"
                    rx="2.5"
                    fill="url(#syrMetal)"
                    stroke="#b0b6be"
                    strokeWidth="0.5"
                  />

                  {/* Barrel body */}
                  <rect
                    x="72"
                    y="32"
                    width="240"
                    height="20"
                    rx="4"
                    fill="url(#syrGlass)"
                    stroke="#c5c9d0"
                    strokeWidth="1"
                    filter="url(#syrShadow)"
                  />

                  {/* Glass highlight streak */}
                  <rect
                    x="80"
                    y="34"
                    width="224"
                    height="2.5"
                    rx="1.25"
                    fill="white"
                    opacity="0.5"
                  />

                  {/* Liquid fill */}
                  <g clipPath="url(#syrClip)">
                    <rect
                      x="74"
                      y="34"
                      width="236"
                      height="16"
                      rx="3"
                      fill="url(#syrLiquid)"
                      opacity="0.55"
                      style={{
                        transformOrigin: '74px 42px',
                        transform: `scaleX(${fillPercentage / 100})`,
                        transition: 'transform 700ms ease-out',
                      }}
                    />
                  </g>

                  {/* Stopper (rubber gasket) */}
                  <g
                    style={{
                      transform: `translateX(${230 * (fillPercentage / 100)}px)`,
                      transition: 'transform 700ms ease-out',
                    }}
                  >
                    <rect x="74" y="33" width="6" height="18" rx="1.5" fill="url(#syrRubber)" />
                    <line
                      x1="76"
                      y1="35"
                      x2="76"
                      y2="49"
                      stroke="#6b7280"
                      strokeWidth="0.3"
                      opacity="0.3"
                    />
                    <line
                      x1="78"
                      y1="35"
                      x2="78"
                      y2="49"
                      stroke="#6b7280"
                      strokeWidth="0.3"
                      opacity="0.3"
                    />
                  </g>

                  {/* mg indicator above fill level */}
                  {result && fillPercentage > 0 && (
                    <g
                      style={{
                        transform: `translateX(${230 * (fillPercentage / 100)}px)`,
                        transition: 'transform 700ms ease-out',
                      }}
                    >
                      <line
                        x1="77"
                        y1="24"
                        x2="77"
                        y2="32"
                        stroke="#c9a84c"
                        strokeWidth="0.6"
                        opacity="0.5"
                      />
                      <rect
                        x="58"
                        y="11"
                        width="38"
                        height="14"
                        rx="4"
                        fill="#fef9eb"
                        stroke="#e8c766"
                        strokeWidth="0.6"
                      />
                      <text
                        x="77"
                        y="21"
                        textAnchor="middle"
                        fill="#a8861e"
                        fontSize="7"
                        fontWeight="700"
                        fontFamily="system-ui, sans-serif"
                        className="select-none"
                      >
                        {parseFloat(result.mg)} mg
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
                        <line
                          x1={x}
                          y1={32}
                          x2={x}
                          y2={32 + tickLen}
                          stroke={isMajor ? '#6b7280' : '#b0b6be'}
                          strokeWidth={isMajor ? 0.8 : 0.5}
                          strokeLinecap="round"
                        />
                        <line
                          x1={x}
                          y1={52}
                          x2={x}
                          y2={52 - tickLen}
                          stroke={isMajor ? '#6b7280' : '#b0b6be'}
                          strokeWidth={isMajor ? 0.8 : 0.5}
                          strokeLinecap="round"
                        />
                        {mark > 0 && (
                          <text
                            x={x}
                            y={64}
                            textAnchor="middle"
                            fill={isMajor ? '#6b7280' : '#9ca3af'}
                            fontSize={isMajor ? '9' : '7.5'}
                            fontWeight={isMajor ? '600' : '500'}
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
                    d="M 72 36 L 62 39 L 62 45 L 72 48 Z"
                    fill="url(#syrHub)"
                    stroke="#adb3bc"
                    strokeWidth="0.5"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="67"
                    y1="38"
                    x2="67"
                    y2="46"
                    stroke="#b8bfc8"
                    strokeWidth="0.4"
                    opacity="0.4"
                  />

                  {/* Needle shaft */}
                  <rect x="42" y="41.2" width="22" height="1.6" rx="0.8" fill="url(#syrNeedle)" />
                  {/* Needle bevel tip */}
                  <polygon points="42,41.2 38,42 42,42.8" fill="#a0a8b2" />

                  {/* Finger flange */}
                  <rect
                    x="312"
                    y="24"
                    width="4"
                    height="36"
                    rx="2"
                    fill="#d4d8de"
                    stroke="#b8bfc8"
                    strokeWidth="0.5"
                  />

                  {/* "UNITS" label */}
                  <text
                    x="190"
                    y="77"
                    textAnchor="middle"
                    fill="#b0b6be"
                    fontSize="7"
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
                      startTransition(() => setUnits(scheduleUnits.toString()));
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
