'use client';

import { useParams, useRouter, notFound } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { FormStep } from '@/domains/intake/components/form-engine';
import IntakeLandingStep from '@/domains/intake/components/IntakeLandingStep';
import type { IntakeBrand } from '@/domains/intake/components/IntakeLandingStep';
import { BookAppointmentStep } from '@/domains/intake/components/form-engine/steps';
import { CheckoutInner } from '@/app/checkout/page';
import { useIntakeStore } from '@/domains/intake/store/intakeStore';
import { LanguageProvider, useLanguage } from '@/domains/intake/contexts/LanguageContext';
import { trackIntakeEvent } from '@/domains/intake/lib/analytics';
import type { FormConfig, FormStep as FormStepType, FormBranding } from '@/domains/intake/types/form-engine';

function IntakeStepContent() {
  const params = useParams();
  const router = useRouter();
  const { language, setLanguage } = useLanguage();

  const clinicSlug = params.clinicSlug as string;
  const templateSlug = params.templateSlug as string;
  const stepId = params.stepId as string;

  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
  const [branding, setBranding] = useState<FormBranding | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitionClass, setTransitionClass] = useState('intake-step-fade');
  const prevStepRef = useRef<string>(stepId);
  const stepEnterTime = useRef<number>(Date.now());

  const store = useIntakeStore;
  const responses = useIntakeStore((s) => s.responses);
  const initSession = useIntakeStore((s) => s.initSession);

  useEffect(() => {
    document.body.classList.add('intake-body');
    return () => { document.body.classList.remove('intake-body'); };
  }, []);

  // Transition animation on step change
  useEffect(() => {
    if (prevStepRef.current === stepId) return;

    const allStepIds = formConfig?.steps.map((s) => s.id) || [];
    const prevIdx = allStepIds.indexOf(prevStepRef.current);
    const currIdx = allStepIds.indexOf(stepId);
    const isBack = currIdx < prevIdx;

    setTransitionClass('');
    requestAnimationFrame(() => {
      setTransitionClass(isBack ? 'intake-step-enter-back' : 'intake-step-enter');
    });

    // Track time on previous step
    const timeSpent = Date.now() - stepEnterTime.current;
    trackIntakeEvent('intake_step_completed', {
      stepId: prevStepRef.current,
      timeSpentMs: timeSpent,
    });

    prevStepRef.current = stepId;
    stepEnterTime.current = Date.now();
  }, [stepId, formConfig]);

  // Track step view
  useEffect(() => {
    if (!loading && stepId) {
      trackIntakeEvent('intake_step_viewed', { stepId });
      stepEnterTime.current = Date.now();
    }
  }, [stepId, loading]);

  // Load form config
  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      try {
        const res = await fetch(`/api/intake-forms/config/${clinicSlug}/${templateSlug}`);
        if (!res.ok) { setError('Form not found'); setLoading(false); return; }
        const data = await res.json();
        if (!cancelled) {
          setFormConfig(data.config);
          setBranding(data.branding);
          initSession(data.config.id, clinicSlug, data.config.startStep);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setError('Failed to load form'); setLoading(false); }
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
    (key: string, value: unknown) => { store.getState().setResponse(key, value); },
    [store],
  );

  const handleSetResponses = useCallback(
    (newResponses: Record<string, unknown>) => { store.getState().setResponses(newResponses); },
    [store],
  );

  const handleMarkCompleted = useCallback(
    (sid: string) => { store.getState().markStepCompleted(sid); },
    [store],
  );

  if (loading) {
    return <div className="min-h-screen bg-white" />;
  }

  if (error || !formConfig || !stepConfig) return notFound();

  const intakeBrand: IntakeBrand = clinicSlug === 'wellmedr' ? 'wellmedr'
    : (clinicSlug === 'ot' || clinicSlug === 'otmens') ? 'otmens'
    : 'eonmeds';

  if (stepId === 'intro') {
    return (
      <div className={transitionClass}>
        <IntakeLandingStep
          branding={branding}
          brand={intakeBrand}
          language={language}
          onLanguageChange={setLanguage}
          onStart={() => handleNavigate('goals')}
        />
      </div>
    );
  }

  if (stepId === 'book-appointment') {
    return (
      <div
        className={transitionClass}
        style={{
          '--intake-primary': branding?.primaryColor ?? '#413d3d',
          '--intake-accent': branding?.accentColor ?? '#cab172',
          '--intake-secondary': branding?.secondaryColor ?? '#f5ecd8',
        } as React.CSSProperties}
      >
        <BookAppointmentStep
          basePath={basePath}
          nextStep=""
          prevStep={stepConfig?.prevStep ?? 'qualified'}
          progressPercent={100}
        />
      </div>
    );
  }

  if (stepId === 'checkout') {
    return (
      <div className={transitionClass}>
        <CheckoutInner />
      </div>
    );
  }

  const logoElement = branding?.logo ? (
    <div className="px-6 lg:px-8 pt-4 max-w-[480px] lg:max-w-[560px] mx-auto w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={branding.logo} alt="Clinic logo" className="h-8 object-contain" />
    </div>
  ) : null;

  return (
    <div
      className={transitionClass}
      style={{
        '--intake-primary': branding?.primaryColor ?? '#10b981',
        '--intake-accent': branding?.accentColor ?? '#f0feab',
        '--intake-secondary': branding?.secondaryColor ?? '#4fa87f',
        '--intake-text': '#1f2937',
        '--intake-text-secondary': '#6b7280',
        '--intake-border': '#e5e7eb',
      } as React.CSSProperties}
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
        onLanguageChange={setLanguage}
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
