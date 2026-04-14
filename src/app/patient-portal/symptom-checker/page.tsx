'use client';

import { useState, useCallback, useRef, useTransition, memo } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  CheckCircle,
  Phone,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  Search,
  X,
  Clock,
  Stethoscope,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import {
  BODY_AREAS,
  DURATION_OPTIONS,
  SEVERITY_OPTIONS,
  PATTERN_OPTIONS,
  STEPS,
  type Step,
  type SymptomItem,
  type Assessment,
} from './data';

const ResultsView = dynamic(() => import('./ResultsView'), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-5">
      <div className="h-48 rounded-3xl bg-gray-200" />
      <div className="h-16 rounded-2xl bg-gray-100" />
      <div className="h-32 rounded-2xl bg-gray-100" />
    </div>
  ),
});

const AnalyzingAnimation = dynamic(() => import('./AnalyzingAnimation'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] flex-col items-center justify-center">
      <div className="h-24 w-24 animate-pulse rounded-full bg-gray-200" />
      <div className="mt-8 h-6 w-48 animate-pulse rounded bg-gray-200" />
    </div>
  ),
});

export default function SymptomCheckerPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [step, setStep] = useState<Step>('welcome');
  const [selectedBodyAreas, setSelectedBodyAreas] = useState<string[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<
    Map<string, SymptomItem & { category: string }>
  >(new Map());
  const [symptomDuration, setSymptomDuration] = useState('');
  const [symptomSeverity, setSymptomSeverity] = useState('');
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToTop = useCallback(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToStep = useCallback(
    (newStep: Step) => {
      setStep(newStep);
      setTimeout(scrollToTop, 50);
    },
    [scrollToTop]
  );

  const toggleBodyArea = useCallback((areaId: string) => {
    startTransition(() => {
      setSelectedBodyAreas((prev) =>
        prev.includes(areaId) ? prev.filter((a) => a !== areaId) : [...prev, areaId]
      );
    });
  }, []);

  const toggleSymptom = useCallback((symptom: SymptomItem, categoryName: string) => {
    startTransition(() => {
      setSelectedSymptoms((prev) => {
        const next = new Map(prev);
        if (next.has(symptom.id)) {
          next.delete(symptom.id);
        } else {
          next.set(symptom.id, { ...symptom, category: categoryName });
        }
        return next;
      });
    });
  }, []);

  const togglePattern = useCallback((pattern: string) => {
    startTransition(() => {
      setSelectedPatterns((prev) =>
        prev.includes(pattern) ? prev.filter((p) => p !== pattern) : [...prev, pattern]
      );
    });
  }, []);

  const getAvailableSymptoms = () => {
    return BODY_AREAS.filter((area) => selectedBodyAreas.includes(area.id));
  };

  const getAllSymptoms = () => {
    const results: (SymptomItem & { category: string })[] = [];
    for (const area of BODY_AREAS) {
      for (const symptom of area.symptoms) {
        if (
          searchQuery &&
          !symptom.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !(symptom.description || '').toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          continue;
        }
        results.push({ ...symptom, category: area.name });
      }
    }
    return results;
  };

  const hasEmergencySymptom = Array.from(selectedSymptoms.values()).some(
    (s) => s.severity === 'emergency'
  );

  const submitAssessment = async () => {
    setError('');
    goToStep('analyzing');

    const symptomsArray = Array.from(selectedSymptoms.values()).map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      severity: s.severity,
    }));

    try {
      const res = await portalFetch('/api/patient-portal/symptom-checker/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms: symptomsArray,
          bodyAreas: selectedBodyAreas,
          duration: symptomDuration,
          severityLevel: symptomSeverity,
          pattern: selectedPatterns.join(', ') || undefined,
          additionalNotes: additionalNotes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Assessment failed');
      }

      const data = await res.json();
      setAssessment(data.assessment);
      goToStep('result');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again or message your care team.'
      );
      goToStep('details');
    }
  };

  const resetChecker = () => {
    setStep('welcome');
    setSelectedBodyAreas([]);
    setSelectedSymptoms(new Map());
    setSymptomDuration('');
    setSymptomSeverity('');
    setSelectedPatterns([]);
    setAdditionalNotes('');
    setAssessment(null);
    setError('');
    setSearchQuery('');
    setExpandedArea(null);
  };

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const showProgressBar = !['welcome', 'analyzing'].includes(step);

  return (
    <div ref={contentRef} className="mx-auto max-w-2xl px-4 pb-32 pt-2 md:px-6">
      {/* Emergency Banner */}
      {hasEmergencySymptom && step !== 'result' && (
        <div className="mb-4 animate-pulse rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <Phone className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-red-800">Emergency Symptom Detected</p>
              <p className="mt-0.5 text-sm text-red-700">
                If you are in immediate danger, call{' '}
                <a href="tel:911" className="font-bold underline">
                  911
                </a>{' '}
                now. Otherwise, continue for a full assessment.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {showProgressBar && (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const isActive = s.key === step || (step === 'result' && s.key === 'result');
              const isCompleted = stepIndex > i || step === 'result';
              return (
                <div key={s.key} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-300 ${
                        isCompleted
                          ? 'text-white shadow-md'
                          : isActive
                            ? 'text-white shadow-lg ring-4 ring-opacity-30'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                      style={
                        isCompleted || isActive
                          ? ({
                              backgroundColor: primaryColor,
                              '--tw-ring-color': `${primaryColor}40`,
                            } as React.CSSProperties)
                          : {}
                      }
                    >
                      {isCompleted && !isActive ? <CheckCircle className="h-5 w-5" /> : s.number}
                    </div>
                    <span
                      className={`mt-1 text-[11px] font-medium ${
                        isActive ? 'opacity-100' : 'text-gray-400'
                      }`}
                      style={isActive ? { color: primaryColor } : {}}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`mx-2 h-0.5 w-8 rounded-full transition-colors duration-300 sm:w-16 ${
                        isCompleted ? '' : 'bg-gray-200'
                      }`}
                      style={isCompleted ? { backgroundColor: primaryColor } : {}}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Back Button */}
      {!['welcome', 'analyzing', 'result'].includes(step) && (
        <button
          onClick={() => {
            if (step === 'body-area') goToStep('welcome');
            else if (step === 'symptoms') goToStep('body-area');
            else if (step === 'details') goToStep('symptoms');
          }}
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      )}

      {/* STEP: Welcome */}
      {step === 'welcome' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div
            className="relative mb-6 overflow-hidden rounded-3xl p-6 text-white shadow-xl sm:p-8"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
          >
            <div
              className="absolute -right-8 -top-8 h-40 w-40 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
            />
            <div
              className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
            />
            <div className="relative">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <span className="text-sm font-medium opacity-90">AI-Powered Assessment</span>
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">How are you feeling?</h1>
              <p className="mt-2 text-base opacity-90 sm:text-lg">
                Tell us about your symptoms and get a personalized assessment with care
                recommendations.
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              How It Works
            </h2>
            <div className="space-y-4">
              {[
                {
                  icon: Stethoscope,
                  title: 'Select your symptoms',
                  desc: "Choose the areas and symptoms you're experiencing",
                },
                {
                  icon: Clock,
                  title: 'Provide context',
                  desc: 'Duration, severity, and any patterns',
                },
                {
                  icon: Sparkles,
                  title: 'Get your assessment',
                  desc: 'AI analyzes your symptoms and provides personalized guidance',
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <item.icon className="h-5 w-5" style={{ color: primaryColor }} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{item.title}</p>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Not a diagnostic tool</p>
                <p className="mt-0.5">
                  This provides guidance only. If you&apos;re having a medical emergency, call{' '}
                  <a href="tel:911" className="font-bold underline">
                    911
                  </a>{' '}
                  immediately.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => goToStep('body-area')}
            className="w-full rounded-2xl py-4 text-lg font-bold text-white shadow-lg transition-all active:scale-[0.98]"
            style={{ backgroundColor: primaryColor }}
          >
            Start Symptom Check
            <ArrowRight className="ml-2 inline h-5 w-5" />
          </button>
        </div>
      )}

      {/* STEP: Body Area Selection */}
      {step === 'body-area' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-400">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">
              Where are you experiencing symptoms?
            </h2>
            <p className="mt-1 text-sm text-gray-500">Select all areas that apply</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BODY_AREAS.map((area) => {
              const Icon = area.icon;
              const isSelected = selectedBodyAreas.includes(area.id);
              const symptomCount = area.symptoms.length;
              return (
                <button
                  key={area.id}
                  onClick={() => toggleBodyArea(area.id)}
                  className={`group relative rounded-2xl border-2 p-4 text-left transition-all duration-200 active:scale-[0.98] ${
                    isSelected
                      ? 'shadow-md'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                  }`}
                  style={
                    isSelected
                      ? {
                          borderColor: primaryColor,
                          backgroundColor: `${primaryColor}08`,
                        }
                      : {}
                  }
                >
                  {isSelected && (
                    <div
                      className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <CheckCircle className="h-4 w-4" />
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
                      style={{
                        backgroundColor: isSelected ? `${primaryColor}20` : '#f3f4f6',
                        color: isSelected ? primaryColor : '#9ca3af',
                      }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{area.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{area.description}</p>
                      <p className="mt-1 text-[11px] font-medium text-gray-400">
                        {symptomCount} symptoms
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => goToStep('symptoms')}
            disabled={selectedBodyAreas.length === 0}
            className="mt-6 w-full rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            Continue — Select Symptoms
            <ArrowRight className="ml-2 inline h-5 w-5" />
          </button>
        </div>
      )}

      {/* STEP: Symptom Selection */}
      {step === 'symptoms' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-400">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900">What symptoms are you experiencing?</h2>
            <p className="mt-1 text-sm text-gray-500">Tap to select — you can choose multiple</p>
          </div>

          {selectedSymptoms.size > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {Array.from(selectedSymptoms.values()).map((symptom) => (
                <button
                  key={symptom.id}
                  onClick={() => toggleSymptom(symptom, symptom.category)}
                  className="flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: primaryColor }}
                >
                  {symptom.name}
                  <X className="h-3.5 w-3.5 opacity-80" />
                </button>
              ))}
            </div>
          )}

          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search all symptoms..."
              value={searchQuery}
              onChange={(e) => startTransition(() => setSearchQuery(e.target.value))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-opacity-30"
              style={{ '--tw-ring-color': `${primaryColor}40` } as React.CSSProperties}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {searchQuery ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-500">Search Results</h3>
              <div className="space-y-1.5">
                {getAllSymptoms().map((symptom) => (
                  <SymptomButton
                    key={symptom.id}
                    symptom={symptom}
                    category={symptom.category}
                    isSelected={selectedSymptoms.has(symptom.id)}
                    onToggle={toggleSymptom}
                    primaryColor={primaryColor}
                  />
                ))}
                {getAllSymptoms().length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No symptoms matching &ldquo;{searchQuery}&rdquo;
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {getAvailableSymptoms().map((area) => {
                const Icon = area.icon;
                const isExpanded = expandedArea === area.id || selectedBodyAreas.length === 1;
                const selectedInArea = area.symptoms.filter((s) =>
                  selectedSymptoms.has(s.id)
                ).length;
                return (
                  <div
                    key={area.id}
                    className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
                  >
                    <button
                      onClick={() => setExpandedArea(isExpanded ? null : area.id)}
                      className="flex w-full items-center justify-between p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${primaryColor}15` }}
                        >
                          <Icon className="h-4 w-4" style={{ color: primaryColor }} />
                        </div>
                        <div className="text-left">
                          <span className="font-semibold text-gray-900">{area.name}</span>
                          {selectedInArea > 0 && (
                            <span
                              className="ml-2 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                              style={{ backgroundColor: primaryColor }}
                            >
                              {selectedInArea}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-50 px-4 pb-4 pt-2">
                        <div className="space-y-1.5">
                          {area.symptoms.map((symptom) => (
                            <SymptomButton
                              key={symptom.id}
                              symptom={symptom}
                              category={area.name}
                              isSelected={selectedSymptoms.has(symptom.id)}
                              onToggle={toggleSymptom}
                              primaryColor={primaryColor}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => goToStep('details')}
            disabled={selectedSymptoms.size === 0}
            className="mt-6 w-full rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            Continue — Add Details ({selectedSymptoms.size} selected)
            <ArrowRight className="ml-2 inline h-5 w-5" />
          </button>
        </div>
      )}

      {/* STEP: Details */}
      {step === 'details' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-400">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">Tell us a bit more</h2>
            <p className="mt-1 text-sm text-gray-500">
              This helps us give you a more accurate assessment
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-800">{error}</p>
                  <p className="mt-0.5 text-xs text-red-600">
                    You can try again or{' '}
                    <a href="/patient-portal/chat" className="underline">
                      message your care team
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2.5 text-sm font-semibold text-gray-500">Your Symptoms</h3>
            <div className="flex flex-wrap gap-2">
              {Array.from(selectedSymptoms.values()).map((s) => (
                <span
                  key={s.id}
                  className="rounded-full px-3 py-1 text-sm font-medium"
                  style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}
                >
                  {s.name}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-1 font-semibold text-gray-900">How long have you had these?</h3>
            <p className="mb-3 text-xs text-gray-400">Select the closest option</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = symptomDuration === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSymptomDuration(opt.value)}
                    className={`rounded-xl border-2 p-3 text-left transition-all active:scale-[0.97] ${
                      isSelected ? 'shadow-sm' : 'border-gray-100 hover:border-gray-200'
                    }`}
                    style={
                      isSelected
                        ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` }
                        : {}
                    }
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <p
                      className={`mt-1 text-sm font-semibold ${isSelected ? '' : 'text-gray-900'}`}
                      style={isSelected ? { color: primaryColor } : {}}
                    >
                      {opt.label}
                    </p>
                    <p className="text-[11px] text-gray-400">{opt.sublabel}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-1 font-semibold text-gray-900">How severe are your symptoms?</h3>
            <p className="mb-3 text-xs text-gray-400">At their worst right now</p>
            <div className="space-y-2">
              {SEVERITY_OPTIONS.map((opt) => {
                const isSelected = symptomSeverity === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSymptomSeverity(opt.value)}
                    className={`w-full rounded-xl border-2 p-4 text-left transition-all active:scale-[0.98] ${
                      isSelected ? 'shadow-sm' : 'border-gray-100 hover:border-gray-200'
                    }`}
                    style={
                      isSelected
                        ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` }
                        : {}
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{opt.emoji}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.sublabel}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-1 font-semibold text-gray-900">Any patterns you&apos;ve noticed?</h3>
            <p className="mb-3 text-xs text-gray-400">Optional — select any that apply</p>
            <div className="flex flex-wrap gap-2">
              {PATTERN_OPTIONS.map((pattern) => {
                const isSelected = selectedPatterns.includes(pattern);
                return (
                  <button
                    key={pattern}
                    onClick={() => togglePattern(pattern)}
                    className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95 ${
                      isSelected
                        ? 'border-transparent text-white'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                    style={isSelected ? { backgroundColor: primaryColor } : {}}
                  >
                    {pattern}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-1 font-semibold text-gray-900">Anything else?</h3>
            <p className="mb-3 text-xs text-gray-400">Optional — add any details that might help</p>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder='e.g., "Started after I increased my dose this week"'
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none transition-colors focus:border-gray-300 focus:bg-white"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{additionalNotes.length}/500</p>
          </div>

          <button
            onClick={submitAssessment}
            disabled={!symptomDuration || !symptomSeverity}
            className="w-full rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            <Sparkles className="mr-2 inline h-5 w-5" />
            Get My Assessment
          </button>
        </div>
      )}

      {/* STEP: Analyzing */}
      {step === 'analyzing' && <AnalyzingAnimation primaryColor={primaryColor} />}

      {/* STEP: Results */}
      {step === 'result' && assessment && (
        <ResultsView
          assessment={assessment}
          primaryColor={primaryColor}
          onReset={resetChecker}
          selectedSymptoms={Array.from(selectedSymptoms.values())}
        />
      )}
    </div>
  );
}

const SymptomButton = memo(function SymptomButton({
  symptom,
  category,
  isSelected,
  onToggle,
  primaryColor,
}: {
  symptom: SymptomItem;
  category: string;
  isSelected: boolean;
  onToggle: (s: SymptomItem, cat: string) => void;
  primaryColor: string;
}) {
  const severityDot =
    symptom.severity === 'emergency'
      ? 'bg-red-500'
      : symptom.severity === 'urgent'
        ? 'bg-orange-400'
        : symptom.severity === 'moderate'
          ? 'bg-amber-400'
          : 'bg-gray-300';

  return (
    <button
      onClick={() => onToggle(symptom, category)}
      className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all active:scale-[0.98] ${
        isSelected ? 'shadow-sm' : 'border-transparent hover:bg-gray-50'
      }`}
      style={isSelected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` } : {}}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
          isSelected ? 'border-transparent text-white' : 'border-gray-200'
        }`}
        style={isSelected ? { backgroundColor: primaryColor } : {}}
      >
        {isSelected && <CheckCircle className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-semibold ${isSelected ? '' : 'text-gray-900'}`}
            style={isSelected ? { color: primaryColor } : {}}
          >
            {symptom.name}
          </span>
          <span className={`h-1.5 w-1.5 rounded-full ${severityDot}`} />
          {symptom.severity === 'emergency' && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
              EMERGENCY
            </span>
          )}
        </div>
        {symptom.description && (
          <p className="mt-0.5 text-xs text-gray-400">{symptom.description}</p>
        )}
      </div>
    </button>
  );
});
