'use client';

/**
 * Symptom Checker Page
 * AI-powered symptom assessment with urgency triage
 */

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Phone,
  MessageCircle,
  Calendar,
  ChevronRight,
  ArrowLeft,
  Heart,
  Thermometer,
  Activity,
  Frown,
  Info,
} from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import Link from 'next/link';

// Common symptoms for GLP-1 medication patients
const SYMPTOM_CATEGORIES = [
  {
    id: 'digestive',
    name: 'Digestive',
    icon: Activity,
    symptoms: [
      { id: 'nausea', name: 'Nausea', severity: 'common' },
      { id: 'vomiting', name: 'Vomiting', severity: 'moderate' },
      { id: 'diarrhea', name: 'Diarrhea', severity: 'common' },
      { id: 'constipation', name: 'Constipation', severity: 'common' },
      { id: 'stomach_pain', name: 'Stomach Pain', severity: 'moderate' },
      { id: 'bloating', name: 'Bloating', severity: 'common' },
      { id: 'acid_reflux', name: 'Acid Reflux', severity: 'common' },
      { id: 'severe_stomach_pain', name: 'Severe Stomach Pain', severity: 'urgent' },
    ],
  },
  {
    id: 'injection_site',
    name: 'Injection Site',
    icon: Heart,
    symptoms: [
      { id: 'redness', name: 'Redness', severity: 'common' },
      { id: 'swelling', name: 'Swelling', severity: 'common' },
      { id: 'bruising', name: 'Bruising', severity: 'common' },
      { id: 'itching', name: 'Itching', severity: 'common' },
      { id: 'hard_lump', name: 'Hard Lump', severity: 'moderate' },
      { id: 'spreading_redness', name: 'Spreading Redness/Warmth', severity: 'urgent' },
    ],
  },
  {
    id: 'general',
    name: 'General',
    icon: Thermometer,
    symptoms: [
      { id: 'fatigue', name: 'Fatigue', severity: 'common' },
      { id: 'headache', name: 'Headache', severity: 'common' },
      { id: 'dizziness', name: 'Dizziness', severity: 'moderate' },
      { id: 'low_blood_sugar', name: 'Low Blood Sugar Symptoms', severity: 'moderate' },
      { id: 'fever', name: 'Fever', severity: 'moderate' },
      { id: 'severe_allergic', name: 'Severe Allergic Reaction', severity: 'emergency' },
    ],
  },
  {
    id: 'mood',
    name: 'Mood & Mental',
    icon: Frown,
    symptoms: [
      { id: 'mood_changes', name: 'Mood Changes', severity: 'common' },
      { id: 'anxiety', name: 'Increased Anxiety', severity: 'moderate' },
      { id: 'depression', name: 'Depression Symptoms', severity: 'moderate' },
      { id: 'suicidal_thoughts', name: 'Thoughts of Self-Harm', severity: 'emergency' },
    ],
  },
];

type UrgencyLevel = 'self-care' | 'schedule-visit' | 'contact-team' | 'urgent-care' | 'emergency';

interface Assessment {
  urgency: UrgencyLevel;
  title: string;
  message: string;
  recommendations: string[];
  actions: Array<{ label: string; url: string; icon: typeof Phone }>;
}

const URGENCY_CONFIG: Record<UrgencyLevel, { color: string; bgColor: string; icon: typeof CheckCircle }> = {
  'self-care': { color: 'text-green-600', bgColor: 'bg-green-50', icon: CheckCircle },
  'schedule-visit': { color: 'text-blue-600', bgColor: 'bg-blue-50', icon: Calendar },
  'contact-team': { color: 'text-yellow-600', bgColor: 'bg-yellow-50', icon: MessageCircle },
  'urgent-care': { color: 'text-orange-600', bgColor: 'bg-orange-50', icon: AlertTriangle },
  emergency: { color: 'text-red-600', bgColor: 'bg-red-50', icon: Phone },
};

export default function SymptomCheckerPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [step, setStep] = useState<'select' | 'details' | 'result'>('select');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [symptomDuration, setSymptomDuration] = useState<string>('');
  const [symptomSeverity, setSymptomSeverity] = useState<string>('');
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  const toggleSymptom = (symptomId: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(symptomId) ? prev.filter((s) => s !== symptomId) : [...prev, symptomId]
    );
  };

  const getSelectedSymptomDetails = () => {
    const details: Array<{ id: string; name: string; severity: string; category: string }> = [];
    for (const category of SYMPTOM_CATEGORIES) {
      for (const symptom of category.symptoms) {
        if (selectedSymptoms.includes(symptom.id)) {
          details.push({ ...symptom, category: category.name });
        }
      }
    }
    return details;
  };

  const assessSymptoms = () => {
    const symptoms = getSelectedSymptomDetails();

    // Check for emergency symptoms
    if (symptoms.some((s) => s.severity === 'emergency')) {
      setAssessment({
        urgency: 'emergency',
        title: 'Seek Emergency Care',
        message:
          'Based on your symptoms, you should seek emergency medical care immediately. Call 911 or go to your nearest emergency room.',
        recommendations: [
          'Do not drive yourself',
          'Call 911 or have someone take you to the ER',
          'Bring your medication list',
        ],
        actions: [
          { label: 'Call 911', url: 'tel:911', icon: Phone },
        ],
      });
      setStep('result');
      return;
    }

    // Check for urgent symptoms
    if (symptoms.some((s) => s.severity === 'urgent') || symptomSeverity === 'severe') {
      setAssessment({
        urgency: 'urgent-care',
        title: 'Contact Your Care Team Today',
        message:
          'Your symptoms may need prompt medical attention. Please contact your care team as soon as possible or visit urgent care.',
        recommendations: [
          'Contact your care team within the next few hours',
          'If symptoms worsen, seek emergency care',
          'Document your symptoms and when they started',
        ],
        actions: [
          { label: 'Message Care Team', url: '/patient-portal/chat', icon: MessageCircle },
          { label: 'Call Now', url: 'tel:+1234567890', icon: Phone },
        ],
      });
      setStep('result');
      return;
    }

    // Moderate symptoms or long duration
    if (
      symptoms.some((s) => s.severity === 'moderate') ||
      symptomDuration === 'more-than-week' ||
      symptomSeverity === 'moderate'
    ) {
      setAssessment({
        urgency: 'contact-team',
        title: 'Schedule a Follow-Up',
        message:
          'These symptoms are worth discussing with your care team. Consider scheduling a follow-up appointment or sending a message.',
        recommendations: [
          'Keep track of your symptoms',
          'Note any patterns (time of day, relation to meals/medication)',
          'Try the self-care tips below while waiting',
        ],
        actions: [
          { label: 'Book Appointment', url: '/patient-portal/appointments', icon: Calendar },
          { label: 'Send Message', url: '/patient-portal/chat', icon: MessageCircle },
        ],
      });
      setStep('result');
      return;
    }

    // Common symptoms - self-care
    setAssessment({
      urgency: 'self-care',
      title: 'Self-Care Recommended',
      message:
        'Your symptoms are common side effects that often improve with time and self-care. Here are some tips to help manage them.',
      recommendations: getSelfCareRecommendations(symptoms),
      actions: [
        { label: 'View Resources', url: '/patient-portal/resources', icon: Info },
        { label: 'Log Symptoms', url: '/patient-portal/progress', icon: Activity },
      ],
    });
    setStep('result');
  };

  const getSelfCareRecommendations = (
    symptoms: Array<{ id: string; name: string; severity: string }>
  ): string[] => {
    const recommendations: string[] = [];

    if (symptoms.some((s) => ['nausea', 'vomiting'].includes(s.id))) {
      recommendations.push('Eat smaller, more frequent meals');
      recommendations.push('Avoid fatty or greasy foods');
      recommendations.push('Stay hydrated with clear fluids');
      recommendations.push('Eat slowly and stop when you feel full');
    }

    if (symptoms.some((s) => s.id === 'constipation')) {
      recommendations.push('Increase fiber intake gradually');
      recommendations.push('Drink plenty of water (at least 64oz daily)');
      recommendations.push('Try gentle exercise like walking');
    }

    if (symptoms.some((s) => s.id === 'headache')) {
      recommendations.push('Stay well hydrated');
      recommendations.push('Get adequate rest');
      recommendations.push('Take breaks from screens');
    }

    if (symptoms.some((s) => ['redness', 'swelling', 'bruising', 'itching'].includes(s.id))) {
      recommendations.push('Rotate injection sites');
      recommendations.push('Apply a cool compress to the area');
      recommendations.push('Ensure proper injection technique');
    }

    if (symptoms.some((s) => s.id === 'fatigue')) {
      recommendations.push('Ensure adequate protein intake');
      recommendations.push('Get 7-9 hours of sleep');
      recommendations.push('Light exercise can help boost energy');
    }

    if (recommendations.length === 0) {
      recommendations.push('Rest and monitor your symptoms');
      recommendations.push('Stay hydrated');
      recommendations.push('Contact your care team if symptoms worsen');
    }

    return recommendations.slice(0, 5);
  };

  const resetChecker = () => {
    setStep('select');
    setSelectedSymptoms([]);
    setSymptomDuration('');
    setSymptomSeverity('');
    setAssessment(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="mb-6">
        {step !== 'select' && (
          <button
            onClick={() => setStep(step === 'result' ? 'details' : 'select')}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        )}
        <h1 className="text-2xl font-bold text-gray-900">Symptom Checker</h1>
        <p className="text-gray-600 mt-1">
          {step === 'select' && 'Select any symptoms you\'re experiencing'}
          {step === 'details' && 'Tell us more about your symptoms'}
          {step === 'result' && 'Based on your symptoms'}
        </p>
      </div>

      {/* Disclaimer */}
      {step === 'select' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Important</p>
              <p>
                This is not a diagnostic tool. If you&apos;re experiencing a medical emergency, call 911
                immediately. For serious concerns, contact your care team.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Select Symptoms */}
      {step === 'select' && (
        <div className="space-y-6">
          {SYMPTOM_CATEGORIES.map((category) => {
            const CategoryIcon = category.icon;
            return (
              <div key={category.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <CategoryIcon className="w-5 h-5" style={{ color: primaryColor }} />
                    <h3 className="font-semibold text-gray-900">{category.name}</h3>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-2 gap-2">
                  {category.symptoms.map((symptom) => (
                    <button
                      key={symptom.id}
                      onClick={() => toggleSymptom(symptom.id)}
                      className={`p-3 rounded-xl text-left text-sm font-medium transition-colors border-2 ${
                        selectedSymptoms.includes(symptom.id)
                          ? 'border-opacity-100 bg-opacity-10'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                      style={
                        selectedSymptoms.includes(symptom.id)
                          ? {
                              borderColor: primaryColor,
                              backgroundColor: `${primaryColor}15`,
                              color: primaryColor,
                            }
                          : {}
                      }
                    >
                      {symptom.name}
                      {symptom.severity === 'emergency' && (
                        <span className="ml-1 text-red-500">⚠️</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          <button
            onClick={() => setStep('details')}
            disabled={selectedSymptoms.length === 0}
            className="w-full py-4 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: primaryColor }}
          >
            Continue ({selectedSymptoms.length} selected)
          </button>
        </div>
      )}

      {/* Step 2: Symptom Details */}
      {step === 'details' && (
        <div className="space-y-6">
          {/* Selected Symptoms Summary */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-medium text-gray-900 mb-2">Selected Symptoms</h3>
            <div className="flex flex-wrap gap-2">
              {getSelectedSymptomDetails().map((symptom) => (
                <span
                  key={symptom.id}
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                >
                  {symptom.name}
                </span>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 mb-3">How long have you had these symptoms?</h3>
            <div className="space-y-2">
              {[
                { value: 'today', label: 'Started today' },
                { value: 'few-days', label: 'A few days' },
                { value: 'week', label: 'About a week' },
                { value: 'more-than-week', label: 'More than a week' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSymptomDuration(option.value)}
                  className={`w-full p-3 rounded-xl text-left font-medium transition-colors border-2 ${
                    symptomDuration === option.value
                      ? 'border-opacity-100'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                  style={
                    symptomDuration === option.value
                      ? { borderColor: primaryColor, color: primaryColor }
                      : {}
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 mb-3">How severe are your symptoms?</h3>
            <div className="space-y-2">
              {[
                { value: 'mild', label: 'Mild - Noticeable but manageable' },
                { value: 'moderate', label: 'Moderate - Affecting daily activities' },
                { value: 'severe', label: 'Severe - Very difficult to manage' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSymptomSeverity(option.value)}
                  className={`w-full p-3 rounded-xl text-left font-medium transition-colors border-2 ${
                    symptomSeverity === option.value
                      ? 'border-opacity-100'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                  style={
                    symptomSeverity === option.value
                      ? { borderColor: primaryColor, color: primaryColor }
                      : {}
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={assessSymptoms}
            disabled={!symptomDuration || !symptomSeverity}
            className="w-full py-4 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: primaryColor }}
          >
            Get Assessment
          </button>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 'result' && assessment && (
        <div className="space-y-6">
          {/* Urgency Card */}
          <div
            className={`rounded-2xl p-6 ${URGENCY_CONFIG[assessment.urgency].bgColor}`}
          >
            <div className="flex items-center gap-3 mb-4">
              {(() => {
                const UrgencyIcon = URGENCY_CONFIG[assessment.urgency].icon;
                return (
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${URGENCY_CONFIG[assessment.urgency].bgColor}`}
                  >
                    <UrgencyIcon
                      className={`w-6 h-6 ${URGENCY_CONFIG[assessment.urgency].color}`}
                    />
                  </div>
                );
              })()}
              <div>
                <h2
                  className={`text-xl font-bold ${URGENCY_CONFIG[assessment.urgency].color}`}
                >
                  {assessment.title}
                </h2>
              </div>
            </div>
            <p className="text-gray-700">{assessment.message}</p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {assessment.actions.map((action, index) => {
              const ActionIcon = action.icon;
              return (
                <Link
                  key={index}
                  href={action.url}
                  className={`flex items-center justify-between p-4 rounded-xl font-medium transition-colors ${
                    index === 0 ? 'text-white' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                  style={index === 0 ? { backgroundColor: primaryColor } : {}}
                >
                  <span className="flex items-center gap-2">
                    <ActionIcon className="w-5 h-5" />
                    {action.label}
                  </span>
                  <ChevronRight className="w-5 h-5" />
                </Link>
              );
            })}
          </div>

          {/* Recommendations */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Recommendations</h3>
            <ul className="space-y-2">
              {assessment.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2 text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>

          {/* Start Over */}
          <button
            onClick={resetChecker}
            className="w-full py-3 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Check Different Symptoms
          </button>
        </div>
      )}
    </div>
  );
}
