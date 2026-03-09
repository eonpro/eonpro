'use client';

import React, { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { FormStep } from '@/domains/intake/components/form-engine';
import { resolveNextStep } from '@/domains/intake/types/form-engine';
import type { FormConfig, FormStep as FormStepType } from '../state/builderTypes';
import DeviceFrame from './DeviceFrame';

export interface FormPreviewPanelProps {
  config: FormConfig;
  devicePreview: 'mobile' | 'tablet' | 'desktop';
  language: 'en' | 'es';
  previewStepId: string | null;
  onPreviewStepChange: (stepId: string | null) => void;
}

export default function FormPreviewPanel({
  config,
  devicePreview,
  language,
  previewStepId,
  onPreviewStepChange,
}: FormPreviewPanelProps) {
  const [mockResponses, setMockResponses] = useState<Record<string, unknown>>({});

  const steps = config.steps ?? [];
  const stepIndex = previewStepId
    ? steps.findIndex((s) => s.id === previewStepId)
    : -1;
  const currentStep = stepIndex >= 0 ? steps[stepIndex] : steps[0] ?? null;
  const stepNumber = stepIndex >= 0 ? stepIndex + 1 : 0;
  const totalSteps = steps.length;

  const handleSetResponse = useCallback((key: string, value: unknown) => {
    setMockResponses((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSetResponses = useCallback((responses: Record<string, unknown>) => {
    setMockResponses((prev) => ({ ...prev, ...responses }));
  }, []);

  const handleMarkCompleted = useCallback(() => {
    // No-op for preview; navigation is handled by onNavigate
  }, []);

  const handleNavigate = useCallback(
    (stepId: string) => {
      onPreviewStepChange(stepId);
    },
    [onPreviewStepChange],
  );

  const handleBack = useCallback(() => {
    if (!currentStep?.prevStep) return;
    onPreviewStepChange(currentStep.prevStep);
  }, [currentStep, onPreviewStepChange]);

  const goToPrevStep = useCallback(() => {
    if (stepIndex <= 0) return;
    const prev = steps[stepIndex - 1];
    if (prev) onPreviewStepChange(prev.id);
  }, [stepIndex, steps, onPreviewStepChange]);

  const goToNextStep = useCallback(() => {
    if (!currentStep) return;
    const next = resolveNextStep(currentStep, mockResponses);
    if (next) {
      onPreviewStepChange(next);
    } else if (stepIndex < totalSteps - 1) {
      const nextStep = steps[stepIndex + 1];
      if (nextStep) onPreviewStepChange(nextStep.id);
    }
  }, [currentStep, mockResponses, stepIndex, totalSteps, steps, onPreviewStepChange]);

  if (steps.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-medium text-gray-600">Preview</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-gray-500 font-medium">No steps to preview</p>
          <p className="text-sm text-gray-400 mt-1">Add steps to your form to see a preview.</p>
        </div>
      </div>
    );
  }

  // Sync previewStepId when it's null but we have steps
  const effectiveStepId = previewStepId ?? steps[0]?.id ?? null;
  const effectiveStep = effectiveStepId
    ? steps.find((s) => s.id === effectiveStepId) ?? steps[0]
    : steps[0];
  const effectiveIndex = steps.findIndex((s) => s.id === effectiveStep.id);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: step indicator, language toggle */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">
            Step {effectiveIndex + 1} of {totalSteps}
          </span>
          {effectiveStep && (
            <span className="text-sm text-gray-500 truncate max-w-[200px]">
              {language === 'es' ? effectiveStep.title?.es : effectiveStep.title?.en}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-200">
          <Globe className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-medium text-gray-600 uppercase">
            {language}
          </span>
        </div>
      </div>

      {/* Device frame with FormStep */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DeviceFrame device={devicePreview}>
          {effectiveStep && (
            <FormStep
              config={effectiveStep as FormStepType}
              basePath="/preview"
              language={language}
              branding={config.branding}
              responses={mockResponses}
              onSetResponse={handleSetResponse}
              onSetResponses={handleSetResponses}
              onMarkCompleted={handleMarkCompleted}
              onNavigate={handleNavigate}
              onBack={handleBack}
            />
          )}
        </DeviceFrame>
      </div>

      {/* Step navigation controls */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-t border-gray-200 bg-gray-50">
        <button
          type="button"
          onClick={goToPrevStep}
          disabled={effectiveIndex <= 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        <button
          type="button"
          onClick={goToNextStep}
          disabled={effectiveIndex >= totalSteps - 1}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
