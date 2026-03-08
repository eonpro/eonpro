'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle,
  Clock,
  Users,
  FileText,
  ArrowLeft,
  Loader2,
  Sparkles,
  Download,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import SOAPNoteEditor from './SOAPNoteEditor';
import { PostCallData } from './types';

interface PostCallSummaryProps {
  data: PostCallData;
  onBackToQueue: () => void;
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

export default function PostCallSummary({ data, onBackToQueue }: PostCallSummaryProps) {
  const [soapNote, setSoapNote] = useState<SOAPNoteData>(
    data.soapNote || {
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

  useEffect(() => {
    if (!data.soapNote && data.transcript && data.session.appointment?.id) {
      generateSOAP();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generateSOAP = async () => {
    if (!data.session.appointment?.id) return;

    setIsGenerating(true);
    try {
      const res = await apiFetch('/api/ai-scribe/generate-soap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: data.session.appointment.id,
          patientId: data.session.patient.id,
          autoSave: true,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.soapNote) {
          setSoapNote({
            id: result.soapNote.id,
            subjective: result.soapNote.subjective || '',
            objective: result.soapNote.objective || '',
            assessment: result.soapNote.assessment || '',
            plan: result.soapNote.plan || '',
            medicalNecessity: result.soapNote.medicalNecessity || '',
            status: result.soapNote.status || 'DRAFT',
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
              <h1 className="text-xl font-bold text-gray-900">Call Completed</h1>
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
              {soapNote.id ? (
                <span className={soapNote.status === 'APPROVED' ? 'text-emerald-600' : 'text-blue-600'}>
                  {soapNote.status === 'APPROVED' ? 'Signed' : 'Draft'}
                </span>
              ) : isGenerating ? (
                <span className="flex items-center gap-1 text-purple-600">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Generating
                </span>
              ) : (
                <span className="text-gray-400">Pending</span>
              )}
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
              onClick={generateSOAP}
              className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {soapNote.subjective ? 'Regenerate with AI' : 'Generate with AI'}
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
          <button
            onClick={onBackToQueue}
            className="mt-4 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Return to Telehealth Center
          </button>
        </div>
      )}
    </div>
  );
}
