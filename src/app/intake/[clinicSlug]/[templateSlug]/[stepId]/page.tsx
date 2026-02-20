'use client';

import { useParams, useRouter, notFound } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { FormStep } from '@/domains/intake/components/form-engine';
import { useIntakeStore } from '@/domains/intake/store/intakeStore';
import { LanguageProvider, useLanguage } from '@/domains/intake/contexts/LanguageContext';
import type { FormConfig, FormStep as FormStepType, FormBranding } from '@/domains/intake/types/form-engine';

/**
 * Dynamic Intake Page
 *
 * Configuration-driven route that handles all intake steps.
 * Route: /intake/[clinicSlug]/[templateSlug]/[stepId]
 *
 * Loads the form config from the API, resolves the current step,
 * and renders the FormStep engine component.
 */
function IntakeStepContent() {
  const params = useParams();
  const router = useRouter();
  const { language } = useLanguage();

  const clinicSlug = params.clinicSlug as string;
  const templateSlug = params.templateSlug as string;
  const stepId = params.stepId as string;

  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
  const [branding, setBranding] = useState<FormBranding | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const store = useIntakeStore;
  const responses = useIntakeStore((s) => s.responses);
  const initSession = useIntakeStore((s) => s.initSession);

  // Load form config from API
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const res = await fetch(
          `/api/intake-forms/config/${clinicSlug}/${templateSlug}`,
        );
        if (!res.ok) {
          setError('Form not found');
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setFormConfig(data.config);
          setBranding(data.branding);
          initSession(data.config.id, clinicSlug, data.config.startStep);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load form');
          setLoading(false);
        }
      }
    }

    loadConfig();
    return () => { cancelled = true; };
  }, [clinicSlug, templateSlug, initSession]);

  const stepConfig = useMemo<FormStepType | undefined>(() => {
    if (!formConfig) return undefined;
    return formConfig.steps.find((s) => s.id === stepId);
  }, [formConfig, stepId]);

  const basePath = `/intake/${clinicSlug}/${templateSlug}`;

  const handleNavigate = useCallback(
    (nextStepId: string) => {
      store.getState().setCurrentStep(nextStepId);
      router.push(`${basePath}/${nextStepId}`);
    },
    [basePath, router, store],
  );

  const handleBack = useCallback(() => {
    if (stepConfig?.prevStep) {
      store.getState().setCurrentStep(stepConfig.prevStep);
      router.push(`${basePath}/${stepConfig.prevStep}`);
    }
  }, [stepConfig, basePath, router, store]);

  const handleSetResponse = useCallback(
    (key: string, value: unknown) => {
      store.getState().setResponse(key, value);
    },
    [store],
  );

  const handleSetResponses = useCallback(
    (newResponses: Record<string, unknown>) => {
      store.getState().setResponses(newResponses);
    },
    [store],
  );

  const handleMarkCompleted = useCallback(
    (sid: string) => {
      store.getState().markStepCompleted(sid);
    },
    [store],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error || !formConfig) {
    return notFound();
  }

  if (!stepConfig) {
    return notFound();
  }

  const logoElement = branding?.logo ? (
    <div className="px-6 lg:px-8 pt-4 max-w-md lg:max-w-2xl mx-auto w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={branding.logo}
        alt="Clinic logo"
        className="h-8 object-contain"
      />
    </div>
  ) : null;

  return (
    <div
      style={
        {
          '--intake-primary': branding?.primaryColor ?? '#413d3d',
          '--intake-accent': branding?.accentColor ?? '#f0feab',
          '--intake-secondary': branding?.secondaryColor ?? '#4fa87f',
        } as React.CSSProperties
      }
    >
      <FormStep
        config={stepConfig}
        basePath={basePath}
        language={language}
        branding={branding}
        logoElement={logoElement}
        responses={responses}
        onSetResponse={handleSetResponse}
        onSetResponses={handleSetResponses}
        onMarkCompleted={handleMarkCompleted}
        onNavigate={handleNavigate}
        onBack={handleBack}
      />
    </div>
  );
}

export default function IntakeStepPage() {
  return (
    <LanguageProvider>
      <IntakeStepContent />
    </LanguageProvider>
  );
}
