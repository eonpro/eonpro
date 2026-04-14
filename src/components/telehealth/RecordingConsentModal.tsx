'use client';

import { useState } from 'react';
import { Mic, Shield, FileText, AlertTriangle, X, Sparkles } from 'lucide-react';

interface RecordingConsentModalProps {
  patientName: string;
  onConsent: () => void;
  onDecline: () => void;
}

export default function RecordingConsentModal({
  patientName,
  onConsent,
  onDecline,
}: RecordingConsentModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <Mic className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">AI Scribe Recording</h2>
              <p className="text-sm text-gray-500">Consent required before recording</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm leading-relaxed text-gray-700">
            The <strong>AI Scribe</strong> will record and transcribe this telehealth session with{' '}
            <strong>{patientName}</strong> to automatically generate clinical documentation (SOAP
            notes).
          </p>

          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <div className="text-xs text-gray-600">
                <p className="font-semibold text-gray-700">What the AI Scribe does</p>
                <p className="mt-0.5">
                  Records audio during the call, transcribes the conversation, and generates a draft
                  SOAP note for your review and signature.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <div className="text-xs text-gray-600">
                <p className="font-semibold text-gray-700">HIPAA compliance</p>
                <p className="mt-0.5">
                  All recordings and transcripts are encrypted at rest and stored in compliance with
                  HIPAA regulations. Audio is processed securely and not retained after
                  transcription.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" />
              <div className="text-xs text-gray-600">
                <p className="font-semibold text-gray-700">Patient consent</p>
                <p className="mt-0.5">
                  You must inform the patient that this session will be recorded for clinical
                  documentation purposes and obtain their verbal consent before proceeding.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800">
                <strong>Important:</strong> You are responsible for obtaining patient consent for
                recording. If the patient declines, you can still proceed with the call without the
                AI Scribe.
              </p>
            </div>
          </div>

          {/* Acknowledgment checkbox */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              I confirm that I have informed the patient about the recording and obtained their
              verbal consent for AI-assisted documentation.
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onDecline}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <X className="h-4 w-4" />
            Skip Recording
          </button>
          <button
            onClick={onConsent}
            disabled={!acknowledged}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            <Mic className="h-4 w-4" />
            Enable AI Scribe
          </button>
        </div>
      </div>
    </div>
  );
}
