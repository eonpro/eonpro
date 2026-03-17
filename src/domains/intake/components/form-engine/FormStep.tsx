'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type {
  FormStep as FormStepType,
  FormBranding,
  FieldOption,
  LocalizedString,
} from '../../types/form-engine';
import { resolveNextStep } from '../../types/form-engine';
import {
  InfoImageStep,
  TypewriterStep,
  BMICalculatingStep,
  BMIResultStep,
  FindingProviderStep,
  QualifiedStep,
  ConsentStep,
  StateSelectStep,
  DateOfBirthStep,
  ContactInfoStep,
  AddressStep,
  WeightInputStep,
  WeightHeightStep,
  TestimonialsStep,
  ProgramsIncludeStep,
  SideEffectsStep,
  SafetyQualityStep,
  ReviewStep,
  SupportInfoStep,
  MedicalHistoryOverviewStep,
  ChronicConditionsDetailStep,
  GLP1DataStep,
  MedicalTeamStep,
  PersonalizedTreatmentStep,
  TreatmentBenefitsStep,
} from './steps';
import {
  OptionButton,
  TextField,
  TextAreaField,
  SelectField,
  CheckboxField,
  SignatureField,
  FileUploadField,
} from './fields';

interface FormStepProps {
  config: FormStepType;
  basePath: string;
  language: 'en' | 'es';
  branding?: FormBranding;
  logoElement?: React.ReactNode;
  responses: Record<string, unknown>;
  onSetResponse: (key: string, value: unknown) => void;
  onSetResponses: (responses: Record<string, unknown>) => void;
  onMarkCompleted: (stepId: string) => void;
  onNavigate: (stepId: string) => void;
  onBack: () => void;
  onLanguageChange?: (lang: 'en' | 'es') => void;
}

export default function FormStep({
  config,
  basePath,
  language,
  branding,
  logoElement,
  responses,
  onSetResponse,
  onSetResponses,
  onMarkCompleted,
  onNavigate,
  onBack,
  onLanguageChange,
}: FormStepProps) {
  const isSpanish = language === 'es';

  const [localValues, setLocalValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    config.fields.forEach((field) => {
      initial[field.id] = responses[field.storageKey] ?? field.defaultValue ?? '';
    });
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, LocalizedString>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const synced: Record<string, unknown> = {};
    config.fields.forEach((field) => {
      synced[field.id] = responses[field.storageKey] ?? field.defaultValue ?? '';
    });
    setLocalValues(synced);
    setMounted(true);
  }, [config.fields, responses]);

  const getText = useCallback(
    (ls: LocalizedString | undefined) => {
      if (!ls) return '';
      return ls[language] ?? ls.en ?? '';
    },
    [language],
  );

  const getErrorText = useCallback(
    (fieldId: string) => {
      const err = errors[fieldId];
      if (!err) return '';
      return err[language] ?? err.en ?? '';
    },
    [errors, language],
  );

  // ---- Handlers ----

  const handleSingleSelect = useCallback(
    (fieldId: string, storageKey: string, value: string) => {
      setLocalValues((prev) => ({ ...prev, [fieldId]: value }));
      onSetResponse(storageKey, value);

      if (config.autoAdvance) {
        onMarkCompleted(config.id);
        const merged = { ...responses, [storageKey]: value };
        const next = resolveNextStep(config, merged);
        if (next) onNavigate(next);
      }
    },
    [config, responses, onSetResponse, onMarkCompleted, onNavigate],
  );

  const handleMultiSelect = useCallback(
    (fieldId: string, value: string) => {
      setLocalValues((prev) => {
        const curr = Array.isArray(prev[fieldId])
          ? (prev[fieldId] as string[])
          : [];
        const next = curr.includes(value)
          ? curr.filter((v) => v !== value)
          : [...curr, value];
        return { ...prev, [fieldId]: next };
      });
    },
    [],
  );

  const handleTextChange = useCallback(
    (fieldId: string, value: string) => {
      setLocalValues((prev) => ({ ...prev, [fieldId]: value }));
      if (errors[fieldId]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[fieldId];
          return next;
        });
      }
    },
    [errors],
  );

  const handleCheckboxChange = useCallback(
    (fieldId: string, checked: boolean) => {
      setLocalValues((prev) => ({ ...prev, [fieldId]: checked }));
    },
    [],
  );

  // ---- Validation ----

  const validate = useCallback(() => {
    const newErrors: Record<string, LocalizedString> = {};

    config.fields.forEach((field) => {
      const value = localValues[field.id];

      field.validation?.forEach((rule) => {
        if (!rule.message) return;
        switch (rule.type) {
          case 'required':
            if (!value || (Array.isArray(value) && value.length === 0)) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'minLength':
            if (
              typeof value === 'string' &&
              value.length < (rule.value as number)
            ) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'maxLength':
            if (
              typeof value === 'string' &&
              value.length > (rule.value as number)
            ) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'email':
            if (
              value &&
              typeof value === 'string' &&
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
            ) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'phone':
            if (
              value &&
              typeof value === 'string' &&
              !/^(\+1)?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/.test(
                value,
              )
            ) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'min':
            if (typeof value === 'number' && value < (rule.value as number)) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'max':
            if (typeof value === 'number' && value > (rule.value as number)) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'pattern':
            if (
              value &&
              typeof value === 'string' &&
              rule.value instanceof RegExp &&
              !rule.value.test(value)
            ) {
              newErrors[field.id] = rule.message;
            }
            break;
        }
      });
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [config.fields, localValues]);

  // ---- Continue / Back ----

  const handleContinue = useCallback(() => {
    if (!validate()) return;

    const storageUpdates: Record<string, unknown> = {};
    config.fields.forEach((field) => {
      storageUpdates[field.storageKey] = localValues[field.id];
    });
    onSetResponses(storageUpdates);
    onMarkCompleted(config.id);

    const merged = { ...responses, ...storageUpdates };
    const next = resolveNextStep(config, merged);
    if (next) onNavigate(next);
  }, [config, localValues, responses, validate, onSetResponses, onMarkCompleted, onNavigate]);

  const handleBack = useCallback(() => {
    onBack();
  }, [onBack]);

  // ---- Custom step rendering ----

  if (config.type === 'custom' && config.component) {
    const customProps = {
      basePath,
      nextStep: typeof config.nextStep === 'string' ? config.nextStep : '',
      prevStep: config.prevStep,
      progressPercent: config.progressPercent,
    };

    switch (config.component) {
      case 'InfoImageStep':
        return <InfoImageStep {...customProps} imageEn={config.props?.imageEn as string} imageEs={config.props?.imageEs as string} autoAdvanceDelay={config.props?.autoAdvanceDelay as number} />;
      case 'TypewriterStep':
        return <TypewriterStep {...customProps} title={config.title} subtitle={config.subtitle} />;
      case 'BMICalculatingStep':
        return <BMICalculatingStep basePath={basePath} nextStep={customProps.nextStep} />;
      case 'BMIResultStep':
        return <BMIResultStep {...customProps} />;
      case 'FindingProviderStep':
        return <FindingProviderStep basePath={basePath} nextStep={customProps.nextStep} />;
      case 'QualifiedStep':
        return <QualifiedStep basePath={basePath} prevStep={config.prevStep} />;
      case 'ConsentStep':
        return <ConsentStep {...customProps} />;
      case 'StateSelectStep':
        return <StateSelectStep {...customProps} />;
      case 'DateOfBirthStep':
        return <DateOfBirthStep {...customProps} />;
      case 'ContactInfoStep':
        return <ContactInfoStep {...customProps} />;
      case 'AddressStep':
        return <AddressStep {...customProps} />;
      case 'WeightInputStep':
        return <WeightInputStep {...customProps} title={config.title} subtitle={config.subtitle} />;
      case 'WeightHeightStep':
        return <WeightHeightStep {...customProps} />;
      case 'TestimonialsStep':
        return <TestimonialsStep {...customProps} />;
      case 'ProgramsIncludeStep':
        return <ProgramsIncludeStep {...customProps} />;
      case 'SideEffectsStep':
        return <SideEffectsStep {...customProps} />;
      case 'SafetyQualityStep':
        return <SafetyQualityStep {...customProps} />;
      case 'ReviewStep':
        return <ReviewStep {...customProps} />;
      case 'SupportInfoStep':
        return <SupportInfoStep {...customProps} />;
      case 'MedicalHistoryOverviewStep':
        return <MedicalHistoryOverviewStep {...customProps} />;
      case 'ChronicConditionsDetailStep':
        return <ChronicConditionsDetailStep {...customProps} />;
      case 'GLP1DataStep':
        return <GLP1DataStep {...customProps} />;
      case 'MedicalTeamStep':
        return <MedicalTeamStep {...customProps} />;
      case 'PersonalizedTreatmentStep':
        return <PersonalizedTreatmentStep {...customProps} />;
      case 'TreatmentBenefitsStep':
        return <TreatmentBenefitsStep {...customProps} />;
    }
  }

  // ---- Loading placeholder ----

  if (!mounted) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="w-full h-1 bg-gray-100">
          <div
            className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
            style={{ width: `${config.progressPercent}%` }}
          />
        </div>
        {logoElement}
        <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 max-w-[480px] lg:max-w-[560px] mx-auto w-full">
          <div className="space-y-8">
            <div>
              <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-semibold text-[var(--intake-text,#1f2937)]">
                {getText(config.title)}
              </h1>
            </div>
            <div className="space-y-4 animate-pulse">
              {config.fields.map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Field rendering ----

  const renderField = (field: (typeof config.fields)[number]) => {
    const value = localValues[field.id];
    const error = getErrorText(field.id);

    switch (field.type) {
      case 'radio':
        return (
          <div className="space-y-3" key={field.id}>
            {field.options?.map((option: FieldOption) => (
              <OptionButton
                key={option.id}
                label={getText(option.label)}
                description={getText(option.description)}
                selected={value === option.value}
                onClick={() =>
                  handleSingleSelect(field.id, field.storageKey, option.value)
                }
              />
            ))}
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        );

      case 'checkbox':
        if (field.options) {
          return (
            <div className="space-y-3" key={field.id}>
              {field.options.map((option: FieldOption) => (
                <OptionButton
                  key={option.id}
                  label={getText(option.label)}
                  description={getText(option.description)}
                  selected={
                    Array.isArray(value) && value.includes(option.value)
                  }
                  onClick={() => handleMultiSelect(field.id, option.value)}
                  showCheckbox
                />
              ))}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          );
        }
        return (
          <CheckboxField
            key={field.id}
            id={field.id}
            label={getText(field.label)}
            checked={!!value}
            onChange={(checked) => handleCheckboxChange(field.id, checked)}
            error={error}
          />
        );

      case 'textarea':
        return (
          <TextAreaField
            key={field.id}
            id={field.id}
            label={getText(field.label)}
            placeholder={getText(field.placeholder)}
            value={(value as string) || ''}
            onChange={(val) => handleTextChange(field.id, val)}
            error={error}
            showLabel
          />
        );

      case 'text':
      case 'email':
      case 'phone':
      case 'number':
        return (
          <TextField
            key={field.id}
            id={field.id}
            label={getText(field.label)}
            placeholder={getText(field.placeholder)}
            value={(value as string) || ''}
            onChange={(val) => handleTextChange(field.id, val)}
            type={field.type === 'phone' ? 'tel' : field.type}
            error={error}
          />
        );

      case 'date':
        return (
          <TextField
            key={field.id}
            id={field.id}
            label={getText(field.label)}
            placeholder={getText(field.placeholder)}
            value={(value as string) || ''}
            onChange={(val) => handleTextChange(field.id, val)}
            type="text"
            error={error}
            showLabel
          />
        );

      case 'select':
        return (
          <SelectField
            key={field.id}
            id={field.id}
            label={getText(field.label)}
            placeholder={getText(field.placeholder)}
            value={(value as string) || ''}
            onChange={(val) => handleTextChange(field.id, val)}
            options={
              field.options?.map((opt) => ({
                value: opt.value,
                label: getText(opt.label),
              })) || []
            }
            error={error}
          />
        );

      case 'signature':
        return (
          <SignatureField
            key={field.id}
            id={field.id}
            label={getText(field.label)}
            value={(value as string) || ''}
            onChange={(val) => handleTextChange(field.id, val)}
            error={error}
          />
        );

      case 'file':
        return (
          <FileUploadField
            key={field.id}
            id={field.id}
            label={getText(field.label)}
            value={(value as string) || ''}
            onChange={(val) => handleTextChange(field.id, val)}
            error={error}
          />
        );

      case 'hidden':
        return null;

      default:
        return null;
    }
  };

  // ---- Layout (matches eonmeds weightlossintake UI/UX) ----

  const contentMaxWidth = 'max-w-[480px] lg:max-w-[560px]';
  const contentPadding = 'px-6 lg:px-8';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Language toggle + Progress bar */}
      <div className="relative">
        {onLanguageChange && (
          <div className="fixed top-3 right-3 z-50 flex items-center bg-white rounded-full border border-gray-200">
            <button
              onClick={() => onLanguageChange('en')}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-all ${language === 'en' ? 'bg-[#413d3d] text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <svg width="14" height="9" viewBox="0 0 18 12" fill="none"><rect width="18" height="12" rx="1" fill="#B22234"/><rect y="1" width="18" height="1" fill="white"/><rect y="3" width="18" height="1" fill="white"/><rect y="5" width="18" height="1" fill="white"/><rect y="7" width="18" height="1" fill="white"/><rect y="9" width="18" height="1" fill="white"/><rect y="11" width="18" height="1" fill="white"/><rect width="7.2" height="6" rx="0.5" fill="#3C3B6E"/></svg>
              EN
            </button>
            <button
              onClick={() => onLanguageChange('es')}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-all ${language === 'es' ? 'bg-[#413d3d] text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <svg width="14" height="9" viewBox="0 0 18 12" fill="none"><rect width="18" height="12" rx="1" fill="#FFC400"/><rect width="18" height="3" fill="#C60A1D"/><rect y="9" width="18" height="3" fill="#C60A1D"/></svg>
              ES
            </button>
          </div>
        )}
        <div className="w-full h-1 bg-gray-100">
          <div
            className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
            style={{ width: `${config.progressPercent}%` }}
          />
        </div>
      </div>

      {/* Back button - ghost style */}
      {config.prevStep && (
        <div className={`${contentPadding} pt-6 ${contentMaxWidth} mx-auto w-full`}>
          <button
            onClick={handleBack}
            className="inline-flex items-center justify-center gap-2 py-2 px-4 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label={isSpanish ? 'Volver' : 'Go back'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Logo */}
      {logoElement}

      {/* Main content - match eonmeds .content-container */}
      <div className={`flex-1 flex flex-col ${contentPadding} py-8 ${contentMaxWidth} mx-auto w-full`}>
        <div className="space-y-8">
          {/* Title - match .page-title / .page-subtitle */}
          <div>
            <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-tight tracking-tight text-[var(--intake-text,#1f2937)]">
              {getText(config.title)}
            </h1>
            {config.subtitle && (
              <p className="mt-3 text-[clamp(0.9375rem,2vw,1.0625rem)] font-normal text-[var(--intake-text-secondary,#6b7280)] leading-snug">
                {getText(config.subtitle)}
              </p>
            )}
          </div>

          {/* Fields */}
          <div className="space-y-4">{config.fields.map(renderField)}</div>
        </div>
      </div>

      {/* Continue button - eonmeds .continue-button (dark gradient, rounded-full, hover lift) */}
      {config.showContinueButton && (
        <div className={`${contentPadding} pb-6 ${contentMaxWidth} mx-auto w-full space-y-4`}>
          <button
            onClick={handleContinue}
            className="
              w-full flex items-center justify-center gap-3 py-4 px-8
              text-white text-[1.0625rem] font-medium
              rounded-full transition-all duration-200
              bg-[linear-gradient(135deg,#1f2937_0%,#111827_100%)]
              hover:-translate-y-0.5 hover:shadow-lg
              active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
            "
          >
            <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {/* Copyright - match eonmeds */}
          <p className="text-center text-xs text-gray-500">
            {isSpanish ? (
              <>© 2026 EONPro, LLC. Todos los derechos reservados. Proceso exclusivo y protegido.</>
            ) : (
              <>© 2026 EONPro, LLC. All rights reserved. Exclusive and protected process.</>
            )}
          </p>
        </div>
      )}

      {/* Copyright when no continue button (e.g. auto-advance steps) */}
      {!config.showContinueButton && (
        <div className={`${contentPadding} pb-6 ${contentMaxWidth} mx-auto w-full`}>
          <p className="text-center text-xs text-gray-500">
            {isSpanish ? (
              <>© 2026 EONPro, LLC. Todos los derechos reservados. Proceso exclusivo y protegido.</>
            ) : (
              <>© 2026 EONPro, LLC. All rights reserved. Exclusive and protected process.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
