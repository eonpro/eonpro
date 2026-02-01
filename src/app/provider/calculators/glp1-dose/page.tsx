'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Syringe,
  Droplets,
  Check,
  ChevronRight,
  AlertTriangle,
  Info,
  FileText,
  Copy,
  Pill,
} from 'lucide-react';
import {
  getMedicationInfo,
  convertDose,
  getUnitsForDose,
  validateDose,
  SEMAGLUTIDE_INFO,
  TIRZEPATIDE_INFO,
  INJECTION_TIPS,
  type GLP1Medication,
  type TitrationStep,
} from '@/lib/calculators';

export default function ProviderGLP1DoseCalculatorPage() {
  const [medication, setMedication] = useState<GLP1Medication>('semaglutide');
  const [concentration, setConcentration] = useState(5);
  const [units, setUnits] = useState('');
  const [selectedWeek, setSelectedWeek] = useState<TitrationStep | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const medInfo = useMemo(() => getMedicationInfo(medication), [medication]);

  // Update concentration when medication changes
  useMemo(() => {
    setConcentration(medInfo.concentrations[1]?.value || medInfo.concentrations[0].value);
    setSelectedWeek(null);
    setUnits('');
  }, [medication]);

  const result = useMemo(() => {
    const unitsNum = parseFloat(units || '0');
    if (unitsNum <= 0) return null;
    return convertDose(unitsNum, 'units', concentration);
  }, [units, concentration]);

  const calculatedUnits = useMemo(() => {
    if (!selectedWeek) return null;
    return {
      units: getUnitsForDose(selectedWeek.dose, concentration),
      mL: (selectedWeek.dose / concentration).toFixed(3),
    };
  }, [selectedWeek, concentration]);

  const doseValidation = useMemo(() => {
    if (!result) return null;
    return validateDose(medication, result.mg);
  }, [medication, result]);

  const fillPercentage = Math.min(100, (parseFloat(units || '0') / 100) * 100);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const generateDocumentation = () => {
    if (!result) return '';
    const dose = selectedWeek?.dose || result.mg;
    return `${medInfo.name} ${dose} mg SC weekly
Concentration: ${concentration} mg/mL
Units: ${calculatedUnits?.units || result.units} units
Volume: ${calculatedUnits?.mL || result.mL} mL
${notes ? `\nNotes: ${notes}` : ''}`;
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
        <h1 className="text-2xl font-bold text-gray-900">GLP-1 Dosage Calculator</h1>
        <p className="text-gray-500 mt-1">
          Calculate injection doses for Semaglutide and Tirzepatide
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Medication Selection */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Pill className="h-5 w-5 text-purple-500" />
              Select Medication
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setMedication('semaglutide')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  medication === 'semaglutide'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold text-gray-900">Semaglutide</p>
                <p className="text-sm text-gray-500">Wegovy, Ozempic</p>
                {medication === 'semaglutide' && (
                  <Check className="h-5 w-5 text-purple-500 mt-2" />
                )}
              </button>
              <button
                onClick={() => setMedication('tirzepatide')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  medication === 'tirzepatide'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold text-gray-900">Tirzepatide</p>
                <p className="text-sm text-gray-500">Mounjaro, Zepbound</p>
                {medication === 'tirzepatide' && (
                  <Check className="h-5 w-5 text-amber-500 mt-2" />
                )}
              </button>
            </div>
          </div>

          {/* Concentration Selection */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              Vial Concentration
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {medInfo.concentrations.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setConcentration(c.value)}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    concentration === c.value
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-2xl font-semibold">{c.value}</p>
                  <p className={`text-sm ${concentration === c.value ? 'text-gray-300' : 'text-gray-500'}`}>
                    mg/mL
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Units Input */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Syringe className="h-5 w-5 text-green-500" />
              Enter Units or Select Dose
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Manual Entry */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Manual Units Entry
                </label>
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
                    className="w-full rounded-xl border border-gray-200 px-4 py-4 text-center text-3xl font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-medium uppercase tracking-wider text-gray-400">
                    insulin units
                  </span>
                </div>

                {/* Syringe Visualization */}
                <div className="mt-4 flex justify-center">
                  <div className="relative w-14">
                    <div className="relative h-48 w-14 overflow-hidden rounded-xl border-4 border-gray-200 bg-gradient-to-b from-gray-50 to-gray-100 shadow-inner">
                      <div
                        className="absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out"
                        style={{
                          height: `${fillPercentage}%`,
                          background: medication === 'semaglutide'
                            ? 'linear-gradient(to top, #8B5CF6, #A78BFA)'
                            : 'linear-gradient(to top, #F59E0B, #FBBF24)',
                        }}
                      />
                      {[0, 25, 50, 75, 100].map((mark) => (
                        <div
                          key={mark}
                          className="absolute left-0 flex w-full items-center"
                          style={{ bottom: `${mark}%` }}
                        >
                          <div className="w-3 h-0.5 bg-gray-300" />
                          <span className="ml-1 text-[9px] font-semibold text-gray-400">{mark}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Select by Week */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Or Select Titration Week
                </label>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                  {medInfo.titrationSchedule.map((schedule, i) => {
                    const scheduleUnits = getUnitsForDose(schedule.dose, concentration);
                    const isSelected = selectedWeek?.week === schedule.week;
                    return (
                      <button
                        key={schedule.week}
                        onClick={() => {
                          setSelectedWeek(schedule);
                          setUnits(scheduleUnits.toString());
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                          isSelected
                            ? 'bg-gray-100 ring-2 ring-gray-900'
                            : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold ${
                              isSelected
                                ? 'bg-gray-900 text-white'
                                : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {i + 1}
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-gray-900 text-sm">{schedule.label}</p>
                            <p className="text-xs text-gray-500">{schedule.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{schedule.dose} mg</p>
                          <p className="text-xs text-gray-500">{scheduleUnits} units</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Provider Notes */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="flex items-center justify-between w-full"
            >
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-500" />
                Provider Notes
              </h2>
              <ChevronRight className={`h-5 w-5 text-gray-400 transition-transform ${showNotes ? 'rotate-90' : ''}`} />
            </button>
            
            {showNotes && (
              <div className="mt-4">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add dosing rationale, patient tolerability notes, etc."
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-24"
                />
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {/* Dose Result Card */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: medication === 'semaglutide'
                ? 'linear-gradient(135deg, #8B5CF6, #A78BFA)'
                : 'linear-gradient(135deg, #F59E0B, #FBBF24)',
            }}
          >
            <div className="text-white">
              <div className="flex items-center gap-2 mb-4">
                <Syringe className="h-5 w-5 opacity-80" />
                <span className="text-sm font-semibold uppercase tracking-wider opacity-80">
                  Calculated Dose
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl bg-white/20 p-4 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-80 mb-1">
                    Units
                  </p>
                  <p className="text-3xl font-bold">{units || '0'}</p>
                </div>
                <div className="rounded-xl bg-white/20 p-4 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-80 mb-1">
                    Milligrams
                  </p>
                  <p className="text-3xl font-bold">{result?.mg.toFixed(2) || '0'}</p>
                </div>
              </div>

              <div className="rounded-xl bg-white/30 p-4 text-center backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80 mb-1">
                  Volume to Inject
                </p>
                <p className="text-2xl font-bold">{result?.mL.toFixed(3) || '0'} mL</p>
              </div>
            </div>
          </div>

          {/* Dose Validation */}
          {doseValidation && !doseValidation.valid && (
            <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{doseValidation.message}</p>
              </div>
            </div>
          )}

          {/* Copy Documentation */}
          {result && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Documentation</h3>
              <div className="bg-gray-50 rounded-xl p-4 font-mono text-sm text-gray-700 whitespace-pre-line mb-3">
                {generateDocumentation()}
              </div>
              <button
                onClick={() => copyToClipboard(generateDocumentation())}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
              >
                {copiedText ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy to Clipboard
                  </>
                )}
              </button>
            </div>
          )}

          {/* Formula Card */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Conversion Formula</h3>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-gray-50">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Units to mL
                </p>
                <p className="font-mono text-gray-900">
                  {units || '0'} units ÷ 100 = {result?.mL.toFixed(3) || '0'} mL
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gray-50">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  mL to mg
                </p>
                <p className="font-mono text-gray-900">
                  {result?.mL.toFixed(3) || '0'} mL × {concentration} mg/mL = {result?.mg.toFixed(2) || '0'} mg
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Quick Reference
                </p>
                <p className="font-mono text-blue-900 font-semibold">
                  100 units = 1 mL = {concentration} mg
                </p>
              </div>
            </div>
          </div>

          {/* Medication Info */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Medication Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Brand Names</span>
                <span className="text-gray-900 font-medium">{medInfo.brandNames.join(', ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Frequency</span>
                <span className="text-gray-900 font-medium">{medInfo.administrationFrequency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Maintenance Dose</span>
                <span className="text-gray-900 font-medium">{medInfo.maintenanceDose} mg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Dose</span>
                <span className="text-gray-900 font-medium">{medInfo.maxDose} mg</span>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <AlertTriangle className="mb-2 h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-amber-900 mb-2">Boxed Warning</h3>
            <p className="text-sm text-amber-800">
              Thyroid C-cell tumors: {medInfo.name} is contraindicated in patients with 
              a personal or family history of medullary thyroid carcinoma (MTC) or 
              Multiple Endocrine Neoplasia syndrome type 2 (MEN 2).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
