'use client';

import {
  Phone,
  MessageCircle,
  Calendar,
  ChevronRight,
  Heart,
  Clock,
  Stethoscope,
  AlertTriangle,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { URGENCY_STYLES, type Assessment } from './data';

export default function ResultsView({
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
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-5 duration-500">
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

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
        <p className="text-xs text-gray-500">
          This assessment is for informational purposes only and is not a medical diagnosis. Always
          follow up with your care team for medical advice.
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
