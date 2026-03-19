'use client';

import { useState, useEffect } from 'react';

import {
  CheckCircle,
  Clock,
  Users,
  FileText,
  ArrowLeft,
  Sparkles,
  Download,
  Video,
} from 'lucide-react';

import { apiFetch } from '@/lib/api/fetch';
import { safeParseJsonString } from '@/lib/utils/safe-json';

import SOAPNoteEditor from './SOAPNoteEditor';
import { type PostCallData } from './types';

interface PostCallSummaryProps {
  data: PostCallData;
  onBackToQueue: () => void;
  onSelectNextPatient?: (session: any) => void;
}

interface SOAPNoteData {
  id?: number;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  medicalNecessity?: string;
  status: string;
}

export default function PostCallSummary({ data, onBackToQueue, onSelectNextPatient }: PostCallSummaryProps) {
  const [soapNote, setSoapNote] = useState<SOAPNoteData>(
    data.soapNote ?? {
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
      medicalNecessity: '',
      status: 'DRAFT',
    }
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [providerId, setProviderId] = useState<number | undefined>();
  const [nextSession, setNextSession] = useState<any>(null);

  useEffect(() => {
    try {
      const user = localStorage.getItem('user');
      if (user) {
        const parsed = safeParseJsonString<Record<string, unknown>>(user);
        if (parsed?.providerId) setProviderId(Number(parsed.providerId));
        else if (parsed?.id) setProviderId(Number(parsed.id));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!onSelectNextPatient) return;
    const fetchNext = async () => {
      try {
        const res = await apiFetch('/api/provider/telehealth/upcoming');
        if (!res.ok) return;
        const upcomingData = await res.json();
        const sessions = (upcomingData.sessions ?? []).filter(
          (s: any) =>
            (s.status === 'WAITING' || s.status === 'SCHEDULED') &&
            s.id !== data.session.id &&
            s.appointment?.id !== data.session.appointment?.id
        );
        if (sessions.length > 0) {
          const waiting = sessions.find((s: any) => s.status === 'WAITING');
          setNextSession(waiting ?? sessions[0]);
        }
      } catch { /* non-blocking */ }
    };
    void fetchNext();
  }, [data.session.id, data.session.appointment?.id, onSelectNextPatient]);

  useEffect(() => {
    if (!data.soapNote && data.session.appointment?.id && providerId) {
      void generateSOAP();
    }
  }, [providerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const generateSOAP = async () => {
    if (!data.session.appointment?.id || !providerId || isGenerating) return;

    const transcriptText = data.transcript
      || `Telehealth consultation with ${data.session.patient.firstName} ${data.session.patient.lastName}. Duration: ${Math.ceil(data.duration / 60)} minutes. Reason: ${data.session.appointment?.reason || data.session.topic || 'Follow-up consultation'}.`;

    setIsGenerating(true);
    try {
      const res = await apiFetch('/api/ai-scribe/generate-soap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: data.session.appointment.id,
          patientId: data.session.patient.id,
          providerId,
          transcript: transcriptText,
          saveNote: true,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.soapNote) {
          setSoapNote({
            id: result.soapNote.id,
            subjective: result.soapNote.subjective ?? '',
            objective: result.soapNote.objective ?? '',
            assessment: result.soapNote.assessment ?? '',
            plan: result.soapNote.plan ?? '',
            medicalNecessity: result.soapNote.medicalNecessity ?? '',
            status: result.soapNote.status ?? 'DRAFT',
          });
        }
      }
    } catch {
      // User can create manually
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Back Button */}
      <button
        onClick={onBackToQueue}
        className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Telehealth Center
      </button>

      {/* Call Summary Card */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">Call Completed</h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  <Video className="h-3 w-3" />
                  Telehealth Visit
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Session with {data.session.patient.firstName} {data.session.patient.lastName}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-100 px-6 py-4">
          <div className="pr-6">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              Duration
            </div>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {formatDuration(data.duration)}
            </p>
          </div>
          <div className="px-6">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
              <Users className="h-3.5 w-3.5" />
              Patient
            </div>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {data.session.patient.firstName} {data.session.patient.lastName}
            </p>
          </div>
          <div className="pl-6">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
              <FileText className="h-3.5 w-3.5" />
              SOAP Note
            </div>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {(() => {
                if (soapNote.id) {
                  return (
                    <span className={soapNote.status === 'APPROVED' ? 'text-emerald-600' : 'text-blue-600'}>
                      {soapNote.status === 'APPROVED' ? 'Signed' : 'Draft'}
                    </span>
                  );
                }
                if (isGenerating) {
                  return (
                    <span className="flex items-center gap-1 text-purple-600">
                      <Sparkles className="h-4 w-4 animate-pulse" />
                      Generating
                    </span>
                  );
                }
                return <span className="text-gray-400">Pending</span>;
              })()}
            </p>
          </div>
        </div>
      </div>

      {/* SOAP Note Editor */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <SOAPNoteEditor
          soapNote={soapNote}
          appointmentId={data.session.appointment?.id}
          patientId={data.session.patient.id}
          onUpdate={setSoapNote}
          onSign={() => setIsSigned(true)}
          isGenerating={isGenerating}
        />

        {/* Generate/Regenerate Button */}
        {!isGenerating && data.session.appointment?.id && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <button
              onClick={() => void generateSOAP()}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                soapNote.subjective
                  ? 'border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                  : 'bg-purple-600 text-white shadow-sm hover:bg-purple-700'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {soapNote.subjective ? 'Regenerate with AI' : 'Generate SOAP Note with AI'}
            </button>

            {soapNote.id && (
              <a
                href={`/api/soap-notes/${soapNote.id}/export`}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export PDF
              </a>
            )}
          </div>
        )}
      </div>

      {/* Signed Success */}
      {isSigned && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
          <h3 className="text-lg font-semibold text-gray-900">SOAP Note Signed</h3>
          <p className="mt-1 text-sm text-gray-600">
            The note has been signed and saved to the patient record.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            {nextSession && onSelectNextPatient && (
              <button
                onClick={() => onSelectNextPatient(nextSession)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Users className="h-4 w-4" />
                Next: {nextSession.patient?.firstName} {nextSession.patient?.lastName}
              </button>
            )}
            <button
              onClick={onBackToQueue}
              className={`rounded-lg px-6 py-2.5 text-sm font-medium transition-colors ${
                nextSession && onSelectNextPatient
                  ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Back to Queue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
