'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { ArrowLeft, AlertTriangle, Syringe, Droplets, Check, ChevronRight } from 'lucide-react';

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

  const calculatedUnits = useMemo(() => {
    if (!selectedWeek) return null;
    const mL = selectedWeek.dose / concentration;
    const units = mL * 100;
    return { units: Math.round(units * 10) / 10, mL: mL.toFixed(3) };
  }, [selectedWeek, concentration]);

  const fillPercentage = Math.min(100, (parseFloat(units || '0') / 100) * 100);
  const currentConc = concentrations.find((c) => c.value === concentration);

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
                    className={`group relative overflow-hidden rounded-2xl border-2 p-5 text-center transition-all duration-300 ${
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
              <div className="mx-auto flex max-w-xs justify-center">
                <div className="relative">
                  {/* Syringe body */}
                  <div className="relative h-64 w-16 overflow-hidden rounded-xl border-4 border-gray-200 bg-gradient-to-b from-gray-50 to-gray-100 shadow-inner">
                    {/* Fill */}
                    <div
                      className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out"
                      style={{
                        height: `${fillPercentage}%`,
                        background: `linear-gradient(to top, ${accentColor}, ${accentColor}99)`,
                      }}
                    />
                    {/* Measurement lines */}
                    {[0, 20, 40, 60, 80, 100].map((mark) => (
                      <div
                        key={mark}
                        className="absolute left-0 flex w-full items-center"
                        style={{ bottom: `${mark}%` }}
                      >
                        <div className={`${mark % 20 === 0 ? 'w-4' : 'w-2'} h-0.5 bg-gray-300`} />
                        {mark % 20 === 0 && (
                          <span className="ml-1 text-[10px] font-semibold text-gray-400">{mark}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Plunger */}
                  <div
                    className="absolute left-1/2 w-10 -translate-x-1/2 rounded-t-lg bg-gradient-to-b from-gray-300 to-gray-400 shadow transition-all duration-700"
                    style={{
                      top: `calc(${100 - fillPercentage}% - 40px)`,
                      height: '60px',
                    }}
                  >
                    <div className="absolute -top-4 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-gray-400 shadow" />
                  </div>
                  {/* Needle */}
                  <div className="absolute -bottom-12 left-1/2 h-12 w-1 -translate-x-1/2 rounded-b bg-gradient-to-b from-gray-300 to-gray-500" />
                </div>
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
                    className={`group flex w-full items-center justify-between p-5 text-left transition-all ${
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

          {/* Formula Card */}
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
            <div className="border-b border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900">How It Works</h3>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Step 1: Units to mL
                </div>
                <div className="font-mono text-lg font-semibold text-gray-900">
                  {units || '0'} units ÷ 100 = {result?.mL || '0'} mL
                </div>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Step 2: mL to mg
                </div>
                <div className="font-mono text-lg font-semibold text-gray-900">
                  {result?.mL || '0'} mL × {concentration} mg/mL = {result?.mg || '0'} mg
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: `${primaryColor}10` }}>
                <div
                  className="mb-2 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: primaryColor }}
                >
                  Quick Reference
                </div>
                <div className="font-mono text-lg font-semibold" style={{ color: primaryColor }}>
                  100 units = 1 mL = {concentration} mg
                </div>
              </div>
            </div>
          </div>

          {/* Titration Schedule */}
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
            <div className="border-b border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900">Standard Titration</h3>
              <p className="mt-1 text-sm text-gray-500">Typical dosing schedule</p>
            </div>

            <div className="p-6">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute bottom-0 left-5 top-0 w-0.5 bg-gray-100" />

                <div className="space-y-4">
                  {dosingSchedule.map((s, i) => (
                    <div key={s.week} className="relative flex items-center gap-4 pl-12">
                      <div
                        className={`absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border-4 border-white text-sm font-semibold shadow ${
                          i === dosingSchedule.length - 1
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {i + 1}
                      </div>
                      <div className="flex flex-1 items-center justify-between rounded-2xl bg-gray-50 p-4">
                        <div>
                          <p className="font-semibold text-gray-900">{s.label}</p>
                          <p className="text-sm text-gray-500">{s.desc}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-semibold text-gray-900">{s.dose} mg</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-3xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-amber-900">Important Safety Information</h3>
                <p className="text-sm leading-relaxed text-amber-800">
                  This calculator is for reference only. Always follow your provider's specific
                  dosing instructions. Contact your healthcare provider if you have any questions
                  about your dose or experience side effects.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
