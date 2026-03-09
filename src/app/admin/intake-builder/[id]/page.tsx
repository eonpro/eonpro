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

export default function IntakeBuilderEditorPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [initialConfig, setInitialConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <IntakeFormBuilder
      templateId={templateId}
      initialConfig={initialConfig}
      isActive={template.isActive}
      onSave={handleSave}
      onToggleActive={handleToggleActive}
      onBack={handleBack}
    />
  );
}
