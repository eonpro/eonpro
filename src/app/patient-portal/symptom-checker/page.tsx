'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Phone,
  MessageCircle,
  Calendar,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  Heart,
  Activity,
  Frown,
  Search,
  X,
  Clock,
  Shield,
  Stethoscope,
  Sparkles,
  AlertCircle,
  BookOpen,
  Brain,
  Eye,
  Zap,
  Droplets,
} from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch } from '@/lib/api/patient-portal-client';

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'welcome' | 'body-area' | 'symptoms' | 'details' | 'analyzing' | 'result';
type UrgencyLevel = 'self-care' | 'monitor' | 'schedule-visit' | 'contact-team' | 'urgent-care' | 'emergency';
type SymptomSeverity = 'common' | 'moderate' | 'urgent' | 'emergency';

interface SymptomItem {
  id: string;
  name: string;
  severity: SymptomSeverity;
  description?: string;
}

interface BodyArea {
  id: string;
  name: string;
  icon: typeof Heart;
  description: string;
  symptoms: SymptomItem[];
}

interface Assessment {
  urgency: UrgencyLevel;
  title: string;
  summary: string;
  detailedAssessment: string;
  selfCareTips: string[];
  warningSignsToWatch: string[];
  actions: Array<{ label: string; url: string; type: 'primary' | 'secondary' }>;
  followUpTimeframe: string;
}

// ─── Symptom Data ────────────────────────────────────────────────────────────

const BODY_AREAS: BodyArea[] = [
  {
    id: 'digestive',
    name: 'Stomach & Digestion',
    icon: Activity,
    description: 'Nausea, stomach pain, bowel changes',
    symptoms: [
      { id: 'nausea', name: 'Nausea', severity: 'common', description: 'Feeling sick or queasy' },
      { id: 'vomiting', name: 'Vomiting', severity: 'moderate', description: 'Actually throwing up' },
      { id: 'diarrhea', name: 'Diarrhea', severity: 'common', description: 'Loose or watery stools' },
      { id: 'constipation', name: 'Constipation', severity: 'common', description: 'Difficulty with bowel movements' },
      { id: 'stomach_pain', name: 'Stomach Pain', severity: 'moderate', description: 'Aching or cramping in abdomen' },
      { id: 'bloating', name: 'Bloating', severity: 'common', description: 'Feeling swollen or gassy' },
      { id: 'acid_reflux', name: 'Acid Reflux / Heartburn', severity: 'common', description: 'Burning feeling in chest/throat' },
      { id: 'loss_of_appetite', name: 'Loss of Appetite', severity: 'common', description: 'Not feeling hungry at all' },
      { id: 'severe_stomach_pain', name: 'Severe Abdominal Pain', severity: 'urgent', description: 'Intense, sharp, or radiating pain' },
      { id: 'blood_in_stool', name: 'Blood in Stool', severity: 'urgent', description: 'Visible blood or black/tarry stool' },
    ],
  },
  {
    id: 'injection_site',
    name: 'Injection Site',
    icon: Droplets,
    description: 'Redness, swelling, reactions',
    symptoms: [
      { id: 'redness', name: 'Redness', severity: 'common', description: 'Pink or red skin at injection site' },
      { id: 'swelling', name: 'Swelling', severity: 'common', description: 'Puffy or raised area' },
      { id: 'bruising', name: 'Bruising', severity: 'common', description: 'Blue/purple mark at site' },
      { id: 'itching', name: 'Itching', severity: 'common', description: 'Itchy feeling around injection' },
      { id: 'hard_lump', name: 'Hard Lump', severity: 'moderate', description: 'Firm bump under the skin' },
      { id: 'warmth', name: 'Warmth at Site', severity: 'moderate', description: 'Area feels hot to touch' },
      { id: 'spreading_redness', name: 'Spreading Redness', severity: 'urgent', description: 'Redness growing beyond injection area' },
      { id: 'pus_drainage', name: 'Pus or Drainage', severity: 'urgent', description: 'Yellow/green fluid from site' },
    ],
  },
  {
    id: 'head_neuro',
    name: 'Head & Neurological',
    icon: Brain,
    description: 'Headaches, dizziness, vision changes',
    symptoms: [
      { id: 'headache', name: 'Headache', severity: 'common', description: 'Pain or pressure in head' },
      { id: 'dizziness', name: 'Dizziness', severity: 'moderate', description: 'Feeling lightheaded or off-balance' },
      { id: 'brain_fog', name: 'Brain Fog', severity: 'common', description: 'Difficulty concentrating or thinking clearly' },
      { id: 'vision_changes', name: 'Vision Changes', severity: 'moderate', description: 'Blurry vision or seeing spots' },
      { id: 'severe_headache', name: 'Severe / Worst Headache', severity: 'urgent', description: 'Worst headache of your life' },
    ],
  },
  {
    id: 'energy_body',
    name: 'Energy & Body',
    icon: Zap,
    description: 'Fatigue, muscle pain, weakness',
    symptoms: [
      { id: 'fatigue', name: 'Fatigue', severity: 'common', description: 'Feeling unusually tired' },
      { id: 'weakness', name: 'Muscle Weakness', severity: 'moderate', description: 'Muscles feel weak or heavy' },
      { id: 'muscle_pain', name: 'Muscle or Joint Pain', severity: 'common', description: 'Aching muscles or joints' },
      { id: 'hair_changes', name: 'Hair Thinning', severity: 'common', description: 'Noticeable hair loss or thinning' },
      { id: 'low_blood_sugar', name: 'Low Blood Sugar Signs', severity: 'moderate', description: 'Shakiness, sweating, confusion' },
      { id: 'fever', name: 'Fever', severity: 'moderate', description: 'Temperature above 100.4°F' },
    ],
  },
  {
    id: 'heart_lungs',
    name: 'Heart & Breathing',
    icon: Heart,
    description: 'Heart rate, breathing, chest',
    symptoms: [
      { id: 'fast_heart', name: 'Rapid Heartbeat', severity: 'moderate', description: 'Heart racing or pounding' },
      { id: 'shortness_breath', name: 'Shortness of Breath', severity: 'moderate', description: 'Difficulty catching breath' },
      { id: 'chest_tightness', name: 'Chest Tightness', severity: 'urgent', description: 'Pressure or squeezing in chest' },
      { id: 'chest_pain', name: 'Chest Pain', severity: 'emergency', description: 'Pain or discomfort in chest area' },
      { id: 'difficulty_breathing', name: 'Severe Breathing Difficulty', severity: 'emergency', description: 'Cannot breathe adequately' },
    ],
  },
  {
    id: 'mood_mental',
    name: 'Mood & Mental Health',
    icon: Frown,
    description: 'Mood changes, anxiety, sleep',
    symptoms: [
      { id: 'mood_changes', name: 'Mood Changes', severity: 'common', description: 'Feeling more emotional than usual' },
      { id: 'anxiety', name: 'Increased Anxiety', severity: 'moderate', description: 'Excessive worry or nervousness' },
      { id: 'depression', name: 'Feeling Down / Depressed', severity: 'moderate', description: 'Persistent sadness or hopelessness' },
      { id: 'sleep_issues', name: 'Sleep Problems', severity: 'common', description: 'Trouble falling or staying asleep' },
      { id: 'irritability', name: 'Irritability', severity: 'common', description: 'Feeling easily frustrated or angry' },
      { id: 'suicidal_thoughts', name: 'Thoughts of Self-Harm', severity: 'emergency', description: 'Thoughts of hurting yourself' },
    ],
  },
  {
    id: 'skin_allergic',
    name: 'Skin & Allergic',
    icon: Shield,
    description: 'Rashes, hives, allergic reactions',
    symptoms: [
      { id: 'rash', name: 'Skin Rash', severity: 'moderate', description: 'New or unusual rash' },
      { id: 'hives', name: 'Hives', severity: 'moderate', description: 'Raised, itchy welts' },
      { id: 'dry_skin', name: 'Dry or Flaky Skin', severity: 'common', description: 'Unusually dry or peeling skin' },
      { id: 'face_swelling', name: 'Face / Throat Swelling', severity: 'emergency', description: 'Swelling of lips, tongue, or throat' },
      { id: 'severe_allergic', name: 'Severe Allergic Reaction', severity: 'emergency', description: 'Multiple symptoms: hives + swelling + difficulty breathing' },
    ],
  },
];

const DURATION_OPTIONS = [
  { value: 'just-now', label: 'Just now', sublabel: 'Started within the hour', icon: '⚡' },
  { value: 'today', label: 'Today', sublabel: 'Started earlier today', icon: '🕐' },
  { value: 'few-days', label: 'A few days', sublabel: '2–4 days', icon: '📅' },
  { value: 'week', label: 'About a week', sublabel: '5–7 days', icon: '📆' },
  { value: 'more-than-week', label: '1–4 weeks', sublabel: 'Ongoing for weeks', icon: '🗓️' },
  { value: 'more-than-month', label: 'Over a month', sublabel: 'Long-standing', icon: '📋' },
] as const;

const SEVERITY_OPTIONS = [
  {
    value: 'mild',
    label: 'Mild',
    sublabel: 'Noticeable but manageable — not affecting daily life much',
    color: 'emerald',
    emoji: '🟢',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    sublabel: 'Uncomfortable and affecting some daily activities',
    color: 'amber',
    emoji: '🟡',
  },
  {
    value: 'severe',
    label: 'Severe',
    sublabel: 'Very difficult to manage — significantly impacting your day',
    color: 'red',
    emoji: '🔴',
  },
] as const;

const PATTERN_OPTIONS = [
  'Worse after eating',
  'Worse in the morning',
  'Worse at night',
  'Comes and goes',
  'Getting worse over time',
  'Constant / always there',
  'Related to my injection',
  'Started after dose increase',
  'No clear pattern',
] as const;

const URGENCY_STYLES: Record<UrgencyLevel, {
  gradient: string;
  bgLight: string;
  text: string;
  border: string;
  icon: typeof CheckCircle;
  label: string;
}> = {
  'self-care': {
    gradient: 'from-emerald-500 to-teal-500',
    bgLight: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: CheckCircle,
    label: 'Self-Care',
  },
  monitor: {
    gradient: 'from-sky-500 to-blue-500',
    bgLight: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    icon: Eye,
    label: 'Monitor',
  },
  'schedule-visit': {
    gradient: 'from-blue-500 to-indigo-500',
    bgLight: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: Calendar,
    label: 'Schedule Visit',
  },
  'contact-team': {
    gradient: 'from-amber-500 to-orange-500',
    bgLight: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: MessageCircle,
    label: 'Contact Team',
  },
  'urgent-care': {
    gradient: 'from-orange-500 to-red-500',
    bgLight: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    icon: AlertTriangle,
    label: 'Urgent',
  },
  emergency: {
    gradient: 'from-red-600 to-rose-600',
    bgLight: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: Phone,
    label: 'Emergency',
  },
};

const STEPS: { key: Step; label: string; number: number }[] = [
  { key: 'body-area', label: 'Area', number: 1 },
  { key: 'symptoms', label: 'Symptoms', number: 2 },
  { key: 'details', label: 'Details', number: 3 },
  { key: 'result', label: 'Results', number: 4 },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function SymptomCheckerPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [step, setStep] = useState<Step>('welcome');
  const [selectedBodyAreas, setSelectedBodyAreas] = useState<string[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<Map<string, SymptomItem & { category: string }>>(new Map());
  const [symptomDuration, setSymptomDuration] = useState('');
  const [symptomSeverity, setSymptomSeverity] = useState('');
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToTop = useCallback(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToStep = useCallback((newStep: Step) => {
    setStep(newStep);
    setTimeout(scrollToTop, 50);
  }, [scrollToTop]);

  const toggleBodyArea = (areaId: string) => {
    setSelectedBodyAreas((prev) =>
      prev.includes(areaId) ? prev.filter((a) => a !== areaId) : [...prev, areaId]
    );
  };

  const toggleSymptom = (symptom: SymptomItem, categoryName: string) => {
    setSelectedSymptoms((prev) => {
      const next = new Map(prev);
      if (next.has(symptom.id)) {
        next.delete(symptom.id);
      } else {
        next.set(symptom.id, { ...symptom, category: categoryName });
      }
      return next;
    });
  };

  const togglePattern = (pattern: string) => {
    setSelectedPatterns((prev) =>
      prev.includes(pattern) ? prev.filter((p) => p !== pattern) : [...prev, pattern]
    );
  };

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
      {/* ─── Emergency Banner (always visible when emergency symptom selected) ─── */}
      {hasEmergencySymptom && step !== 'result' && (
        <div className="mb-4 animate-pulse rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <Phone className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-red-800">Emergency Symptom Detected</p>
              <p className="mt-0.5 text-sm text-red-700">
                If you are in immediate danger, call <a href="tel:911" className="font-bold underline">911</a> now.
                Otherwise, continue for a full assessment.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Progress Bar ─── */}
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
                          ? { backgroundColor: primaryColor, '--tw-ring-color': `${primaryColor}40` } as React.CSSProperties
                          : {}
                      }
                    >
                      {isCompleted && !isActive ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        s.number
                      )}
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

      {/* ─── Back Button ─── */}
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

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: Welcome                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {step === 'welcome' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Hero Card */}
          <div
            className="relative mb-6 overflow-hidden rounded-3xl p-6 text-white shadow-xl sm:p-8"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
          >
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
            />
            <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
            />
            <div className="relative">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <span className="text-sm font-medium opacity-90">AI-Powered Assessment</span>
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">How are you feeling?</h1>
              <p className="mt-2 text-base opacity-90 sm:text-lg">
                Tell us about your symptoms and get a personalized assessment with care recommendations.
              </p>
            </div>
          </div>

          {/* How It Works */}
          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              How It Works
            </h2>
            <div className="space-y-4">
              {[
                { icon: Stethoscope, title: 'Select your symptoms', desc: 'Choose the areas and symptoms you\'re experiencing' },
                { icon: Clock, title: 'Provide context', desc: 'Duration, severity, and any patterns' },
                { icon: Sparkles, title: 'Get your assessment', desc: 'AI analyzes your symptoms and provides personalized guidance' },
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

          {/* Disclaimer */}
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Not a diagnostic tool</p>
                <p className="mt-0.5">
                  This provides guidance only. If you&apos;re having a medical emergency, call{' '}
                  <a href="tel:911" className="font-bold underline">911</a> immediately.
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

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: Body Area Selection                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {step === 'body-area' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-400">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">Where are you experiencing symptoms?</h2>
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
                      <p className="mt-0.5 text-xs text-gray-500">
                        {area.description}
                      </p>
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
            className="mt-6 w-full rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
            style={{ backgroundColor: primaryColor }}
          >
            Continue — Select Symptoms
            <ArrowRight className="ml-2 inline h-5 w-5" />
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: Symptom Selection                                                */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {step === 'symptoms' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-400">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900">What symptoms are you experiencing?</h2>
            <p className="mt-1 text-sm text-gray-500">Tap to select — you can choose multiple</p>
          </div>

          {/* Selected Symptoms Tags */}
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

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search all symptoms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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

          {/* Symptom Lists by Body Area */}
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
                const selectedInArea = area.symptoms.filter((s) => selectedSymptoms.has(s.id)).length;
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
            className="mt-6 w-full rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
            style={{ backgroundColor: primaryColor }}
          >
            Continue — Add Details ({selectedSymptoms.size} selected)
            <ArrowRight className="ml-2 inline h-5 w-5" />
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: Details                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {step === 'details' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-400">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">Tell us a bit more</h2>
            <p className="mt-1 text-sm text-gray-500">This helps us give you a more accurate assessment</p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-800">{error}</p>
                  <p className="mt-0.5 text-xs text-red-600">
                    You can try again or{' '}
                    <a href="/patient-portal/chat" className="underline">message your care team</a>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Selected Symptoms Summary */}
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

          {/* Duration */}
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
                      isSelected
                        ? 'shadow-sm'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                    style={
                      isSelected
                        ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` }
                        : {}
                    }
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <p className={`mt-1 text-sm font-semibold ${isSelected ? '' : 'text-gray-900'}`}
                      style={isSelected ? { color: primaryColor } : {}}>
                      {opt.label}
                    </p>
                    <p className="text-[11px] text-gray-400">{opt.sublabel}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Severity */}
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
                      isSelected
                        ? 'shadow-sm'
                        : 'border-gray-100 hover:border-gray-200'
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

          {/* Pattern (optional) */}
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

          {/* Additional Notes (optional) */}
          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-1 font-semibold text-gray-900">Anything else?</h3>
            <p className="mb-3 text-xs text-gray-400">Optional — add any details that might help</p>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="e.g., &quot;Started after I increased my dose this week&quot;"
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none transition-colors focus:border-gray-300 focus:bg-white"
            />
            <p className="mt-1 text-right text-xs text-gray-400">
              {additionalNotes.length}/500
            </p>
          </div>

          <button
            onClick={submitAssessment}
            disabled={!symptomDuration || !symptomSeverity}
            className="w-full rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
            style={{ backgroundColor: primaryColor }}
          >
            <Sparkles className="mr-2 inline h-5 w-5" />
            Get My Assessment
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: Analyzing (loading)                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {step === 'analyzing' && <AnalyzingAnimation primaryColor={primaryColor} />}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: Results                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
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

// ─── Sub-Components ──────────────────────────────────────────────────────────

function SymptomButton({
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
        isSelected
          ? 'shadow-sm'
          : 'border-transparent hover:bg-gray-50'
      }`}
      style={
        isSelected
          ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` }
          : {}
      }
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
          <span className={`text-sm font-semibold ${isSelected ? '' : 'text-gray-900'}`}
            style={isSelected ? { color: primaryColor } : {}}>
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
}

function AnalyzingAnimation({ primaryColor }: { primaryColor: string }) {
  const [dotCount, setDotCount] = useState(1);
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = [
    'Reviewing your symptoms',
    'Analyzing patterns',
    'Checking medical guidelines',
    'Preparing your assessment',
  ];

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 500);
    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2500);
    return () => {
      clearInterval(dotInterval);
      clearInterval(msgInterval);
    };
  }, [messages.length]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center">
      {/* Pulsing circles */}
      <div className="relative mb-8">
        <div
          className="absolute inset-0 animate-ping rounded-full opacity-20"
          style={{ backgroundColor: primaryColor, animationDuration: '2s' }}
        />
        <div
          className="absolute inset-2 animate-ping rounded-full opacity-30"
          style={{ backgroundColor: primaryColor, animationDuration: '2s', animationDelay: '0.5s' }}
        />
        <div
          className="relative flex h-24 w-24 items-center justify-center rounded-full"
          style={{ backgroundColor: `${primaryColor}15` }}
        >
          <Sparkles className="h-10 w-10" style={{ color: primaryColor }} />
        </div>
      </div>
      <p className="text-lg font-bold text-gray-900">
        {messages[messageIndex]}{'.'.repeat(dotCount)}
      </p>
      <p className="mt-2 text-sm text-gray-400">This usually takes a few seconds</p>
    </div>
  );
}

function ResultsView({
  assessment,
  primaryColor,
  onReset,
  selectedSymptoms,
}: {
  assessment: Assessment;
  primaryColor: string;
  onReset: () => void;
  selectedSymptoms: Array<{ id: string; name: string; category: string; severity: string }>;
}) {
  const style = URGENCY_STYLES[assessment.urgency];
  const UrgencyIcon = style.icon;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-5">
      {/* Urgency Hero Card */}
      <div className={`overflow-hidden rounded-3xl shadow-lg`}>
        <div className={`bg-gradient-to-br ${style.gradient} p-6 text-white`}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <UrgencyIcon className="h-6 w-6" />
            </div>
            <div>
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                {style.label}
              </span>
            </div>
          </div>
          <h2 className="text-2xl font-bold">{assessment.title}</h2>
          <p className="mt-2 text-base opacity-90">{assessment.summary}</p>
          {assessment.followUpTimeframe && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-medium backdrop-blur-sm">
              <Clock className="h-4 w-4" />
              Follow up: {assessment.followUpTimeframe}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2.5">
        {assessment.actions.map((action, i) => (
          <a
            key={i}
            href={action.url}
            className={`flex items-center justify-between rounded-2xl p-4 font-semibold transition-all active:scale-[0.98] ${
              action.type === 'primary'
                ? 'text-white shadow-md'
                : 'border border-gray-100 bg-white text-gray-900 shadow-sm hover:bg-gray-50'
            }`}
            style={action.type === 'primary' ? { backgroundColor: primaryColor } : {}}
          >
            <span className="flex items-center gap-2.5">
              {action.url.startsWith('tel:') ? (
                <Phone className="h-5 w-5" />
              ) : action.url.includes('chat') ? (
                <MessageCircle className="h-5 w-5" />
              ) : action.url.includes('appointment') ? (
                <Calendar className="h-5 w-5" />
              ) : (
                <BookOpen className="h-5 w-5" />
              )}
              {action.label}
            </span>
            <ChevronRight className="h-5 w-5 opacity-60" />
          </a>
        ))}
      </div>

      {/* Detailed Assessment */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Stethoscope className="h-5 w-5" style={{ color: primaryColor }} />
          <h3 className="font-bold text-gray-900">Detailed Assessment</h3>
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-gray-700">
          {assessment.detailedAssessment.split('\n').map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>

      {/* Self-Care Tips */}
      {assessment.selfCareTips.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Heart className="h-5 w-5 text-rose-500" />
            <h3 className="font-bold text-gray-900">Self-Care Tips</h3>
          </div>
          <ul className="space-y-3">
            {assessment.selfCareTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {i + 1}
                </div>
                <span className="text-sm text-gray-700">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warning Signs */}
      {assessment.warningSignsToWatch.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="font-bold text-amber-800">Signs to Watch For</h3>
          </div>
          <p className="mb-3 text-xs text-amber-700">
            Contact your care team right away if you experience any of these:
          </p>
          <ul className="space-y-2">
            {assessment.warningSignsToWatch.map((sign, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span className="text-sm text-amber-800">{sign}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Checked Symptoms Recap */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Symptoms Assessed
        </h4>
        <div className="flex flex-wrap gap-2">
          {selectedSymptoms.map((s) => (
            <span
              key={s.id}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm"
            >
              {s.name}
            </span>
          ))}
        </div>
      </div>

      {/* Disclaimer + Reset */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
        <p className="text-xs text-gray-500">
          This assessment is for informational purposes only and is not a medical diagnosis.
          Always follow up with your care team for medical advice.
        </p>
      </div>

      <button
        onClick={onReset}
        className="w-full rounded-2xl border-2 border-gray-200 bg-white py-3.5 font-semibold text-gray-600 transition-all hover:bg-gray-50 active:scale-[0.98]"
      >
        Check Different Symptoms
      </button>
    </div>
  );
}
