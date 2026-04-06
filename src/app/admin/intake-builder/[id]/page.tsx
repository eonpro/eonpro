'use client';

/**
 * Intake Form Builder — Editor Page
 *
 * Full-screen builder experience for editing a single intake form template.
 * Loads the template from the existing API, initializes the builder reducer,
 * and saves back via the existing PUT endpoint.
 *
 * Route: /admin/intake-builder/[id]
 * Isolation: This page is 100% additive. It does not modify any existing files.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import IntakeFormBuilder from '@/components/admin/intake-builder/IntakeFormBuilder';
import type { FormConfig } from '@/components/admin/intake-builder/state/builderTypes';

interface TemplateData {
  id: number;
  name: string;
  description: string | null;
  treatmentType: string;
  isActive: boolean;
  version: number;
  metadata: Record<string, unknown> | null;
}

interface PatientSearchResult {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  patientId?: string | null;
}

export default function IntakeBuilderEditorPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [initialConfig, setInitialConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [sendMethod, setSendMethod] = useState<'email' | 'sms' | 'both' | 'none'>('email');
  const [customMessage, setCustomMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<PatientSearchResult[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/admin/intake-templates/${templateId}`);
        if (!res.ok) {
          setError('Template not found');
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const tmpl = data.template;
        if (!tmpl) {
          setError('Template not found');
          setLoading(false);
          return;
        }

        setTemplate(tmpl);

        const meta = tmpl.metadata as Record<string, unknown> | null;
        const formConfig = meta?.formConfig as FormConfig | undefined;

        if (formConfig) {
          setInitialConfig(formConfig);
        } else {
          setInitialConfig({
            id: `template-${tmpl.id}`,
            name: tmpl.name,
            version: String(tmpl.version),
            description: tmpl.description ?? undefined,
            treatmentType: tmpl.treatmentType,
            steps: [],
            startStep: '',
            languages: ['en', 'es'],
            defaultLanguage: 'en',
            integrations: [{ type: 'platform', triggers: ['complete'] }],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        if (!cancelled) setError('Failed to load template');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [templateId]);

  const handleSave = useCallback(
    async (config: FormConfig) => {
      const res = await fetch(`/api/admin/intake-templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          description: config.description,
          formConfig: config,
        }),
      });

      if (!res.ok) {
        throw new Error('Save failed');
      }

      const data = await res.json();
      if (data.template) {
        setTemplate(data.template);
      }
    },
    [templateId],
  );

  const handleToggleActive = useCallback(async () => {
    if (!template) return;
    const res = await fetch(`/api/admin/intake-templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !template.isActive }),
    });
    if (res.ok) {
      setTemplate((t) => (t ? { ...t, isActive: !t.isActive } : t));
    }
  }, [template, templateId]);

  const handleBack = useCallback(() => {
    router.push('/admin/intake-builder');
  }, [router]);

  const handleSendToClient = useCallback(async () => {
    setSendError(null);
    setGeneratedLink(null);

    if (!recipientEmail.trim()) {
      setSendError('Recipient email is required.');
      return;
    }

    if ((sendMethod === 'sms' || sendMethod === 'both') && !recipientPhone.trim()) {
      setSendError('Phone number is required for SMS delivery.');
      return;
    }

    const numericTemplateId = Number(templateId);
    if (!Number.isFinite(numericTemplateId) || numericTemplateId <= 0) {
      setSendError('Invalid template ID.');
      return;
    }

    setSendLoading(true);
    try {
      const res = await fetch('/api/intake-forms/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: numericTemplateId,
          patientEmail: recipientEmail.trim(),
          patientPhone: recipientPhone.trim() || undefined,
          sendMethod,
          customMessage: customMessage.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSendError(data?.error || 'Failed to send intake form link.');
        return;
      }

      setGeneratedLink(data?.link || null);
      if (sendMethod !== 'none') {
        setCustomMessage('');
      }
    } catch {
      setSendError('Failed to send intake form link.');
    } finally {
      setSendLoading(false);
    }
  }, [customMessage, recipientEmail, recipientPhone, sendMethod, templateId]);

  const handleCopyLink = useCallback(async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
    } catch {
      setSendError('Link created, but failed to copy automatically.');
    }
  }, [generatedLink]);

  useEffect(() => {
    if (!showSendModal) return;

    const query = patientSearch.trim();
    if (query.length < 2) {
      setPatientResults([]);
      setPatientSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setPatientSearchLoading(true);
      setPatientSearchError(null);

      try {
        const res = await fetch(
          `/api/patients?search=${encodeURIComponent(query)}&limit=8&includeContact=true`,
          {
            signal: controller.signal,
            credentials: 'include',
          },
        );

        if (!res.ok) {
          setPatientSearchError('Unable to search patients right now.');
          setPatientResults([]);
          return;
        }

        const data = await res.json();
        const mapped = Array.isArray(data?.patients)
          ? data.patients.map((p: Record<string, unknown>) => ({
              id: Number(p.id),
              firstName: String(p.firstName ?? ''),
              lastName: String(p.lastName ?? ''),
              email: p.email ? String(p.email) : undefined,
              phone: p.phone ? String(p.phone) : undefined,
              patientId: p.patientId ? String(p.patientId) : null,
            }))
          : [];
        setPatientResults(mapped);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setPatientSearchError('Unable to search patients right now.');
        setPatientResults([]);
      } finally {
        setPatientSearchLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [patientSearch, showSendModal]);

  const handleSelectPatient = useCallback((patient: PatientSearchResult) => {
    setSelectedPatient(patient);
    setRecipientEmail(patient.email ?? '');
    setRecipientPhone(patient.phone ?? '');
    setPatientSearch(`${patient.firstName} ${patient.lastName}`.trim());
    setPatientResults([]);
    setPatientSearchError(null);
  }, []);

  // ---- Loading state ----

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading form builder...</p>
        </div>
      </div>
    );
  }

  if (error || !initialConfig || !template) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            {error || 'Template not found'}
          </h2>
          <button
            onClick={handleBack}
            className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Back to templates
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <IntakeFormBuilder
        templateId={templateId}
        initialConfig={initialConfig}
        isActive={template.isActive}
        onSave={handleSave}
        onToggleActive={handleToggleActive}
        onBack={handleBack}
        onSendToClient={() => setShowSendModal(true)}
      />

      {showSendModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setShowSendModal(false);
            setPatientSearch('');
            setPatientResults([]);
            setPatientSearchError(null);
            setSelectedPatient(null);
          }}
        >
          <div
            className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Send Intake Form</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Share this template with a client by email, SMS, both, or link only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSendModal(false);
                  setPatientSearch('');
                  setPatientResults([]);
                  setPatientSearchError(null);
                  setSelectedPatient(null);
                }}
                className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close send intake modal"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="relative">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Find Existing Patient
                </label>
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setSelectedPatient(null);
                  }}
                  placeholder="Search by patient name or email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                {patientSearchLoading && (
                  <p className="mt-1 text-xs text-gray-500">Searching patients...</p>
                )}
                {patientSearchError && (
                  <p className="mt-1 text-xs text-red-600">{patientSearchError}</p>
                )}
                {patientResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {patientResults.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => handleSelectPatient(patient)}
                        className="w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {patient.firstName} {patient.lastName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {patient.email || 'No email'}{patient.patientId ? ` · #${patient.patientId}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {selectedPatient && (
                  <p className="mt-1 text-xs text-green-700">
                    Selected: {selectedPatient.firstName} {selectedPatient.lastName}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Recipient Email
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Recipient Phone (optional)
                </label>
                <input
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="+1 555 555 5555"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Delivery Method
                </label>
                <select
                  value={sendMethod}
                  onChange={(e) => setSendMethod(e.target.value as 'email' | 'sms' | 'both' | 'none')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="both">Email + SMS</option>
                  <option value="none">Create link only (do not send)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Custom Message (optional)
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={3}
                  placeholder="Optional note for the client..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {sendError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {sendError}
                </div>
              )}

              {generatedLink && (
                <div className="space-y-2 rounded-lg bg-green-50 px-3 py-3">
                  <p className="text-sm font-medium text-green-800">
                    Intake link is ready.
                  </p>
                  <div className="rounded border border-green-200 bg-white px-2 py-1.5 text-xs text-gray-700 break-all">
                    {generatedLink}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="text-sm font-medium text-green-700 hover:text-green-800"
                  >
                    Copy link
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSendModal(false);
                  setPatientSearch('');
                  setPatientResults([]);
                  setPatientSearchError(null);
                  setSelectedPatient(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendToClient}
                disabled={sendLoading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {sendLoading ? 'Sending...' : 'Send Intake Form'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
