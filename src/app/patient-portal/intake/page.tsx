'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardDocumentListIcon,
  ArrowRightIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface IntakeDraft {
  sessionId: string;
  currentStep: string;
  completedSteps: string[];
  progressPercent: number;
  templateName: string;
  templateSlug: string;
  clinicSlug: string;
  lastSavedAt: string;
}

interface IntakeTemplate {
  id: string;
  name: string;
  description: string;
  treatmentType: string;
  slug: string;
  clinicSlug: string;
}

export default function PatientPortalIntakePage() {
  const [drafts, setDrafts] = useState<IntakeDraft[]>([]);
  const [templates, setTemplates] = useState<IntakeTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [draftsRes, templatesRes] = await Promise.all([
          fetch('/api/patient-portal/intake/drafts'),
          fetch('/api/patient-portal/intake/templates'),
        ]);

        if (draftsRes.ok) {
          const data = await draftsRes.json();
          setDrafts(data.drafts ?? []);
        }

        if (templatesRes.ok) {
          const data = await templatesRes.json();
          setTemplates(data.templates ?? []);
        }
      } catch (err) {
        console.warn('[IntakePage] Failed to load drafts/templates', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-1/3" />
          <div className="h-32 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Medical Intake</h1>
        <p className="text-gray-500 mt-1">
          Complete your intake form to begin your treatment journey
        </p>
      </div>

      {/* In-progress drafts */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            Continue Where You Left Off
          </h2>
          {drafts.map((draft) => (
            <div
              key={draft.sessionId}
              className="rounded-xl border border-gray-100 p-5 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <ClipboardDocumentListIcon className="w-5 h-5 text-indigo-500 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {draft.templateName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      <ClockIcon className="w-3.5 h-3.5" />
                      <span>
                        Last saved{' '}
                        {new Date(draft.lastSavedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Link
                  href={`/intake/${draft.clinicSlug}/${draft.templateSlug}/${draft.currentStep}`}
                  className="
                    inline-flex items-center gap-1.5 px-4 py-2
                    bg-indigo-600 text-white text-sm font-medium rounded-full
                    hover:bg-indigo-700 transition-colors
                  "
                >
                  Continue
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="mt-3">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${draft.progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {draft.progressPercent}% complete
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Available templates */}
      {templates.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            {drafts.length > 0 ? 'Or Start a New Intake' : 'Start Your Intake'}
          </h2>
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/intake/${template.clinicSlug}/${template.slug}/start`}
              className="
                block rounded-xl border border-gray-100 p-5
                hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors
              "
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">
                    {template.name}
                  </h3>
                  {template.description && (
                    <p className="text-sm text-gray-500 mt-1">
                      {template.description}
                    </p>
                  )}
                </div>
                <ArrowRightIcon className="w-5 h-5 text-gray-300" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Empty state */}
      {drafts.length === 0 && templates.length === 0 && (
        <div className="text-center py-12">
          <ClipboardDocumentListIcon className="w-12 h-12 text-gray-200 mx-auto" />
          <h3 className="mt-4 text-base font-medium text-gray-700">
            No intake forms available
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Your clinic has not set up intake forms yet. Please contact your
            provider.
          </p>
        </div>
      )}
    </div>
  );
}
