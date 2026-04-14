'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import { FileText, Save, CheckCircle, Loader2, Sparkles } from 'lucide-react';

import { apiFetch } from '@/lib/api/fetch';

interface SOAPNoteData {
  id?: number;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  medicalNecessity?: string;
  status: string;
}

interface SOAPNoteEditorProps {
  soapNote: SOAPNoteData;
  appointmentId?: number;
  patientId: number;
  onUpdate: (note: SOAPNoteData) => void;
  onSign: () => void;
  isGenerating?: boolean;
}

const SECTIONS = [
  {
    key: 'subjective' as const,
    label: 'Subjective',
    placeholder: "Patient's reported symptoms, history of present illness, review of systems...",
  },
  {
    key: 'objective' as const,
    label: 'Objective',
    placeholder: 'Physical exam findings, vital signs, test results...',
  },
  {
    key: 'assessment' as const,
    label: 'Assessment',
    placeholder: 'Diagnosis, differential diagnosis, clinical impressions...',
  },
  {
    key: 'plan' as const,
    label: 'Plan',
    placeholder: 'Treatment plan, medications, follow-up, referrals...',
  },
] as const;

export default function SOAPNoteEditor({
  soapNote,
  appointmentId,
  patientId,
  onUpdate,
  onSign,
  isGenerating = false,
}: SOAPNoteEditorProps) {
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutoSave = useRef(false);
  const soapNoteRef = useRef(soapNote);
  soapNoteRef.current = soapNote;

  const handleFieldChange = (key: keyof SOAPNoteData, value: string) => {
    onUpdate({ ...soapNote, [key]: value });
    pendingAutoSave.current = true;
  };

  useEffect(() => {
    if (!pendingAutoSave.current || saving || signing || isGenerating) return;
    if (soapNote.status === 'APPROVED' || soapNote.status === 'LOCKED') return;
    if (!soapNote.subjective && !soapNote.objective && !soapNote.assessment && !soapNote.plan)
      return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      pendingAutoSave.current = false;
      const current = soapNoteRef.current;
      if (!current.id) return;
      setSaving(true);
      void apiFetch(`/api/soap-notes/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjective: current.subjective,
          objective: current.objective,
          assessment: current.assessment,
          plan: current.plan,
          medicalNecessity: current.medicalNecessity,
        }),
      })
        .then(() => {
          setLastSaved(new Date());
        })
        .catch(() => {})
        .finally(() => {
          setSaving(false);
        });
    }, 5000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [
    soapNote.subjective,
    soapNote.objective,
    soapNote.assessment,
    soapNote.plan,
    soapNote.medicalNecessity,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (): Promise<number | undefined> => {
    setSaving(true);
    try {
      if (soapNote.id) {
        await apiFetch(`/api/soap-notes/${soapNote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjective: soapNote.subjective,
            objective: soapNote.objective,
            assessment: soapNote.assessment,
            plan: soapNote.plan,
            medicalNecessity: soapNote.medicalNecessity,
          }),
        });
        setLastSaved(new Date());
        return soapNote.id;
      }

      const res = await apiFetch('/api/soap-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          manualContent: {
            subjective: soapNote.subjective,
            objective: soapNote.objective,
            assessment: soapNote.assessment,
            plan: soapNote.plan,
          },
        }),
      });
      if (res.ok) {
        const responseData = await res.json();
        const noteId = responseData.id ?? responseData.data?.id;
        if (noteId) {
          onUpdate({ ...soapNote, id: noteId });
          setLastSaved(new Date());
          return noteId as number;
        }
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const handleSign = async () => {
    let noteId = soapNote.id;
    if (!noteId) {
      noteId = await handleSave();
    }
    if (!noteId) return;

    setSigning(true);
    try {
      const res = await apiFetch(`/api/soap-notes/${noteId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        onUpdate({ ...soapNote, id: noteId, status: 'APPROVED' });
        onSign();
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn('[SOAPNoteEditor] Approval failed', errData);
      }
    } catch {
      // Non-blocking — user can retry
    } finally {
      setSigning(false);
    }
  };

  const isSigned = soapNote.status === 'APPROVED' || soapNote.status === 'LOCKED';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">SOAP Note</h3>
          {soapNote.id && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
              #{soapNote.id}
            </span>
          )}
          {isGenerating && (
            <span className="flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              <Sparkles className="h-3 w-3 animate-pulse" />
              AI Generating...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastSaved && (
            <span className="text-[10px] text-gray-400">
              Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          <button
            onClick={() => void handleSave()}
            disabled={saving || isSigned}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Draft
          </button>

          {!isSigned && (
            <button
              onClick={() => void handleSign()}
              disabled={signing || !soapNote.subjective || !soapNote.assessment}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-gray-300"
            >
              {signing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              Sign & Complete
            </button>
          )}

          {isSigned && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle className="h-3.5 w-3.5" />
              Signed
            </span>
          )}
        </div>
      </div>

      {/* SOAP Sections */}
      <div className="space-y-4">
        {SECTIONS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-xs font-bold text-blue-700">
                {label[0]}
              </span>
              {label}
            </label>
            <textarea
              value={soapNote[key] ?? ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              placeholder={placeholder}
              disabled={isSigned || isGenerating}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>
        ))}

        {/* Medical Necessity */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            Medical Necessity
          </label>
          <textarea
            value={soapNote.medicalNecessity || ''}
            onChange={(e) => handleFieldChange('medicalNecessity', e.target.value)}
            placeholder="Clinical justification for the encounter..."
            disabled={isSigned || isGenerating}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
          />
        </div>
      </div>
    </div>
  );
}
