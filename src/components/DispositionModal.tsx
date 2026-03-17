'use client';

import { useState } from 'react';
import {
  X,
  ClipboardCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Phone,
  MessageSquare,
  Mail,
  Users,
  Video,
  Globe,
  Tag,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
}

interface DispositionModalProps {
  patient: Patient;
  onClose: () => void;
  onSubmitted: () => void;
}

const LEAD_SOURCES = [
  { value: 'REF_LINK', label: 'Referral Link', icon: Globe },
  { value: 'COLD_CALL', label: 'Cold Call', icon: Phone },
  { value: 'WALK_IN', label: 'Walk-In', icon: Users },
  { value: 'SOCIAL_MEDIA', label: 'Social Media', icon: Globe },
  { value: 'TEXT_MESSAGE', label: 'Text Message', icon: MessageSquare },
  { value: 'EMAIL_CAMPAIGN', label: 'Email Campaign', icon: Mail },
  { value: 'WORD_OF_MOUTH', label: 'Word of Mouth', icon: Users },
  { value: 'EXISTING_PATIENT', label: 'Existing Patient', icon: Users },
  { value: 'EVENT', label: 'Event / Webinar', icon: Users },
  { value: 'OTHER', label: 'Other', icon: Tag },
] as const;

const CONTACT_METHODS = [
  { value: 'PHONE', label: 'Phone Call', icon: Phone },
  { value: 'TEXT', label: 'Text / SMS', icon: MessageSquare },
  { value: 'EMAIL', label: 'Email', icon: Mail },
  { value: 'IN_PERSON', label: 'In Person', icon: Users },
  { value: 'VIDEO_CALL', label: 'Video Call', icon: Video },
  { value: 'SOCIAL_DM', label: 'Social DM', icon: Globe },
  { value: 'OTHER', label: 'Other', icon: Tag },
] as const;

const OUTCOMES = [
  { value: 'SALE_COMPLETED', label: 'Sale Completed', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'INTERESTED', label: 'Interested', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'CALLBACK_REQUESTED', label: 'Callback Requested', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'NOT_INTERESTED', label: 'Not Interested', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'NO_ANSWER', label: 'No Answer', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'WRONG_NUMBER', label: 'Wrong Number', color: 'bg-red-100 text-red-600 border-red-300' },
  { value: 'ALREADY_PATIENT', label: 'Already a Patient', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'DO_NOT_CONTACT', label: 'Do Not Contact', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'OTHER', label: 'Other', color: 'bg-gray-100 text-gray-600 border-gray-300' },
] as const;

const COMMON_TAGS = [
  'high-value',
  'returning',
  'vip',
  'first-time',
  'referral',
  'follow-up-needed',
  'hot-lead',
  'weight-loss',
  'mens-health',
  'womens-health',
];

export default function DispositionModal({
  patient,
  onClose,
  onSubmitted,
}: DispositionModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [leadSource, setLeadSource] = useState('');
  const [contactMethod, setContactMethod] = useState('');
  const [outcome, setOutcome] = useState('');
  const [productInterest, setProductInterest] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const canAdvance = () => {
    if (step === 1) return !!leadSource && !!contactMethod;
    if (step === 2) return !!outcome;
    return true;
  };

  const handleSubmit = async () => {
    if (!outcome || !leadSource || !contactMethod) return;

    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        patientId: patient.id,
        leadSource,
        contactMethod,
        outcome,
      };

      if (productInterest) body.productInterest = productInterest;
      if (notes) body.notes = notes;
      if (followUpDate) body.followUpDate = new Date(followUpDate).toISOString();
      if (followUpNotes) body.followUpNotes = followUpNotes;
      if (selectedTags.length > 0) body.tags = selectedTags;

      const response = await apiFetch('/api/sales-rep/dispositions', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit disposition');
      }

      setSuccess(true);
      setTimeout(() => onSubmitted(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit disposition');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-8 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Disposition Submitted</h3>
            <p className="mt-2 text-sm text-gray-500">
              {outcome === 'SALE_COMPLETED'
                ? 'Sale recorded! An admin will review and approve for commission assignment.'
                : 'Your disposition has been recorded successfully.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

        <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <div
                className="rounded-lg p-2"
                style={{ backgroundColor: 'var(--brand-primary-light, rgba(14, 165, 233, 0.1))' }}
              >
                <ClipboardCheck className="h-5 w-5" style={{ color: 'var(--brand-primary, #0EA5E9)' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Disposition</h2>
                <p className="text-sm text-gray-500">
                  {patient.firstName} {patient.lastName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 px-6 pt-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    s === step
                      ? 'bg-[var(--brand-primary,#0EA5E9)] text-white'
                      : s < step
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {s < step ? '✓' : s}
                </div>
                {s < 3 && (
                  <div className={`h-0.5 w-8 ${s < step ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
            <span className="ml-2 text-xs text-gray-500">
              {step === 1 && 'Source & Contact'}
              {step === 2 && 'Outcome'}
              {step === 3 && 'Details & Tags'}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Content */}
          <div className="px-6 py-4">
            {/* Step 1: Lead Source & Contact Method */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    How did you source this lead?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {LEAD_SOURCES.map((src) => {
                      const Icon = src.icon;
                      return (
                        <button
                          key={src.value}
                          onClick={() => setLeadSource(src.value)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                            leadSource === src.value
                              ? 'border-[var(--brand-primary,#0EA5E9)] bg-[var(--brand-primary-light,rgba(14,165,233,0.08))] font-medium text-[var(--brand-primary,#0EA5E9)]'
                              : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          {src.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    How did you contact them?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {CONTACT_METHODS.map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.value}
                          onClick={() => setContactMethod(m.value)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                            contactMethod === m.value
                              ? 'border-[var(--brand-primary,#0EA5E9)] bg-[var(--brand-primary-light,rgba(14,165,233,0.08))] font-medium text-[var(--brand-primary,#0EA5E9)]'
                              : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Outcome */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    What was the outcome?
                  </label>
                  <div className="space-y-2">
                    {OUTCOMES.map((o) => (
                      <button
                        key={o.value}
                        onClick={() => setOutcome(o.value)}
                        className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                          outcome === o.value
                            ? `${o.color} border-2 font-medium`
                            : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Details & Tags */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Product / Service Interest
                  </label>
                  <input
                    type="text"
                    value={productInterest}
                    onChange={(e) => setProductInterest(e.target.value)}
                    placeholder="e.g., Weight loss program, Testosterone therapy"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary,#0EA5E9)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary,#0EA5E9)]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Any additional context about this interaction..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary,#0EA5E9)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary,#0EA5E9)]"
                  />
                </div>

                {(outcome === 'INTERESTED' || outcome === 'CALLBACK_REQUESTED') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Follow-Up Date
                      </label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary,#0EA5E9)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary,#0EA5E9)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Follow-Up Notes
                      </label>
                      <input
                        type="text"
                        value={followUpNotes}
                        onChange={(e) => setFollowUpNotes(e.target.value)}
                        placeholder="e.g., Call back at 3pm"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary,#0EA5E9)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary,#0EA5E9)]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Tags <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_TAGS.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          selectedTags.includes(tag)
                            ? 'border-[var(--brand-primary,#0EA5E9)] bg-[var(--brand-primary-light,rgba(14,165,233,0.1))] text-[var(--brand-primary,#0EA5E9)]'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
            <button
              onClick={step > 1 ? () => setStep(step - 1) : onClose}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {step > 1 ? 'Back' : 'Cancel'}
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canAdvance()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary, #0EA5E9)' }}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading || !canAdvance()}
                className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary, #0EA5E9)' }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Disposition
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
