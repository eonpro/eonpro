'use client';

import React, { useState, useCallback, useEffect, type ComponentProps } from 'react';
import type {
  FormStep as FormStepType,
  FormBranding,
  FieldOption,
  LocalizedString,
} from '../../types/form-engine';
import { resolveNextStep } from '../../types/form-engine';
import {
  LanguageSelectStep,
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
  HealthImprovementsStep,
  ReferralSourceStep,
  ReferralNameStep,
  BookAppointmentStep,
  PeptideLandingStep,
  TRTLandingStep,
  LabUploadStep,
  PrescriptionSearchStep,
  AllergySearchStep,
} from './steps';
import {
  WmBmiCalcStep,
  WmGoalWeightStep,
  WmDobStep,
  WmImageCardStep,
  WmYesNoDetailStep,
  WmCheckboxListStep,
  WmMotivationRadioStep,
  WmAnimatedWeightChartStep,
  WmMetabolicChartStep,
  WmPatternInfoStep,
  WmTestimonialStep,
  WmCongratsStep,
  WmMedicalReviewStep,
  WmContactInfoStep,
  WmGlp1TypeStep,
  WmCurrentMedsStep,
  WmAllergiesStep,
} from './steps/wellmedr';
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
  const [touched, setTouched] = useState<Record<string, boolean>>({});
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
    [language]
  );

  const getErrorText = useCallback(
    (fieldId: string) => {
      const err = errors[fieldId];
      if (!err) return '';
      return err[language] ?? err.en ?? '';
    },
    [errors, language]
  );

  const validateField = useCallback(
    (fieldId: string) => {
      const field = config.fields.find((f) => f.id === fieldId);
      if (!field?.validation) return;
      const value = localValues[fieldId];

      for (const rule of field.validation) {
        if (!rule.message) continue;
        let invalid = false;
        switch (rule.type) {
          case 'required':
            invalid = !value || (Array.isArray(value) && value.length === 0);
            break;
          case 'email':
            invalid =
              !!value && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            break;
          case 'phone':
            invalid =
              !!value &&
              typeof value === 'string' &&
              !/^(\+1)?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/.test(value);
            break;
          case 'minLength':
            invalid = typeof value === 'string' && value.length < (rule.value as number);
            break;
        }
        if (invalid) {
          setErrors((prev) => ({ ...prev, [fieldId]: rule.message }));
          return;
        }
      }
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    },
    [config.fields, localValues]
  );

  const handleBlur = useCallback(
    (fieldId: string) => {
      setTouched((prev) => ({ ...prev, [fieldId]: true }));
      validateField(fieldId);
    },
    [validateField]
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
    [config, responses, onSetResponse, onMarkCompleted, onNavigate]
  );

  const handleMultiSelect = useCallback((fieldId: string, value: string) => {
    setLocalValues((prev) => {
      const curr = Array.isArray(prev[fieldId]) ? (prev[fieldId] as string[]) : [];
      const next = curr.includes(value) ? curr.filter((v) => v !== value) : [...curr, value];
      return { ...prev, [fieldId]: next };
    });
  }, []);

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
    [errors]
  );

  const handleCheckboxChange = useCallback((fieldId: string, checked: boolean) => {
    setLocalValues((prev) => ({ ...prev, [fieldId]: checked }));
  }, []);

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
            if (typeof value === 'string' && value.length < (rule.value as number)) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'maxLength':
            if (typeof value === 'string' && value.length > (rule.value as number)) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'email':
            if (value && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              newErrors[field.id] = rule.message;
            }
            break;
          case 'phone':
            if (
              value &&
              typeof value === 'string' &&
              !/^(\+1)?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/.test(value)
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
      case 'LanguageSelectStep':
        return <LanguageSelectStep basePath={basePath} nextStep={customProps.nextStep} />;
      case 'InfoImageStep':
        return (
          <InfoImageStep
            {...customProps}
            imageEn={config.props?.imageEn as string}
            imageEs={config.props?.imageEs as string}
            autoAdvanceDelay={config.props?.autoAdvanceDelay as number}
          />
        );
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
      case 'HealthImprovementsStep':
        return <HealthImprovementsStep {...customProps} />;
      case 'ReferralSourceStep':
        return <ReferralSourceStep {...customProps} />;
      case 'ReferralNameStep':
        return <ReferralNameStep {...customProps} />;
      case 'BookAppointmentStep':
        return <BookAppointmentStep {...customProps} />;
      case 'PeptideLandingStep':
        return <PeptideLandingStep {...customProps} />;
      case 'TRTLandingStep':
        return <TRTLandingStep {...customProps} />;
      case 'LabUploadStep':
        return <LabUploadStep {...customProps} />;
      case 'PrescriptionSearchStep':
        return <PrescriptionSearchStep {...customProps} />;
      case 'AllergySearchStep':
        return <AllergySearchStep {...customProps} />;
      case 'CheckoutStep':
        return null;
      case 'WmBmiCalcStep':
        return <WmBmiCalcStep {...customProps} />;
      case 'WmGoalWeightStep':
        return <WmGoalWeightStep {...customProps} />;
      case 'WmDobStep':
        return <WmDobStep {...customProps} />;
      case 'WmImageCardStep':
        return (
          <WmImageCardStep
            {...({ ...customProps, ...config.props } as ComponentProps<typeof WmImageCardStep>)}
          />
        );
      case 'WmYesNoDetailStep':
        return (
          <WmYesNoDetailStep
            {...({ ...customProps, ...config.props } as ComponentProps<typeof WmYesNoDetailStep>)}
          />
        );
      case 'WmCheckboxListStep':
        return (
          <WmCheckboxListStep
            {...({ ...customProps, ...config.props } as ComponentProps<typeof WmCheckboxListStep>)}
          />
        );
      case 'WmMotivationRadioStep':
        return (
          <WmMotivationRadioStep
            {...({ ...customProps, ...config.props } as ComponentProps<
              typeof WmMotivationRadioStep
            >)}
          />
        );
      case 'WmAnimatedWeightChartStep':
        return <WmAnimatedWeightChartStep {...customProps} />;
      case 'WmMetabolicChartStep':
        return <WmMetabolicChartStep {...customProps} />;
      case 'WmPatternInfoStep':
        return <WmPatternInfoStep {...customProps} />;
      case 'WmTestimonialStep':
        return (
          <WmTestimonialStep
            {...({ ...customProps, ...config.props } as ComponentProps<typeof WmTestimonialStep>)}
          />
        );
      case 'WmCongratsStep':
        return <WmCongratsStep {...customProps} />;
      case 'WmMedicalReviewStep':
        return <WmMedicalReviewStep {...customProps} />;
      case 'WmContactInfoStep':
        return <WmContactInfoStep {...customProps} />;
      case 'WmGlp1TypeStep':
        return <WmGlp1TypeStep {...customProps} />;
      case 'WmCurrentMedsStep':
        return <WmCurrentMedsStep {...customProps} />;
      case 'WmAllergiesStep':
        return <WmAllergiesStep {...customProps} />;
    }
  }

  // ---- Loading placeholder ----

  if (!mounted) {
    return (
      <div
        className="flex min-h-screen flex-col"
        style={{ backgroundColor: 'var(--intake-bg, #ffffff)' }}
      >
        <div className="h-1 w-full bg-gray-100">
          <div
            className="h-full transition-all duration-300"
            style={{
              backgroundColor: 'var(--intake-accent, #f0feab)',
              width: `${config.progressPercent}%`,
            }}
          />
        </div>
        {logoElement}
        <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-6 py-8 lg:max-w-[560px] lg:px-8">
          <div className="space-y-8">
            <div>
              <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-semibold text-[var(--intake-text,#1f2937)]">
                {getText(config.title)}
              </h1>
            </div>
            <div className="animate-pulse space-y-4">
              {config.fields.map((_, i) => (
                <div key={i} className="h-14 rounded-2xl bg-gray-100" />
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
                onClick={() => handleSingleSelect(field.id, field.storageKey, option.value)}
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
                  selected={Array.isArray(value) && value.includes(option.value)}
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
            onBlur={() => handleBlur(field.id)}
            type={field.type === 'phone' ? 'tel' : field.type}
            error={touched[field.id] ? error : ''}
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
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: 'var(--intake-bg, #ffffff)' }}
    >
      {/* Progress bar */}
      <div className="h-[5px] w-full rounded-full bg-gray-100">
        <div
          className="h-full rounded-full"
          style={{
            width: `${config.progressPercent}%`,
            backgroundColor: 'var(--intake-accent, #f0feab)',
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      {/* Back button - ghost style */}
      {config.prevStep && (
        <div className={`${contentPadding} pt-6 ${contentMaxWidth} mx-auto w-full`}>
          <button
            onClick={handleBack}
            className="-ml-2 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            aria-label={isSpanish ? 'Volver' : 'Go back'}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Logo */}
      {logoElement}

      {/* Main content */}
      <div
        className={`flex flex-1 flex-col ${contentPadding} py-8 pb-10 ${contentMaxWidth} mx-auto w-full`}
      >
        <div className="space-y-8">
          <div>
            <h1 className="page-title">{getText(config.title)}</h1>
            {config.subtitle && <p className="page-subtitle mt-3">{getText(config.subtitle)}</p>}
          </div>

          {/* Fields */}
          <div className="intake-stagger space-y-4">{config.fields.map(renderField)}</div>
        </div>

        {/* Continue button -- 20px below last field */}
        {config.showContinueButton && (
          <div className="mt-5">
            <button onClick={handleContinue} className="continue-button">
              <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <p className="copyright-text mt-4 text-center">
              {isSpanish ? (
                <>
                  © 2026 EONPro, LLC. Todos los derechos reservados.
                  <br />
                  Proceso exclusivo y protegido.
                </>
              ) : (
                <>
                  © 2026 EONPro, LLC. All rights reserved.
                  <br />
                  Exclusive and protected process.
                </>
              )}
            </p>
          </div>
        )}

        {/* Copyright when no continue button */}
        {!config.showContinueButton && (
          <div className="mt-8">
            <p className="copyright-text text-center">
              {isSpanish ? (
                <>
                  © 2026 EONPro, LLC. Todos los derechos reservados.
                  <br />
                  Proceso exclusivo y protegido.
                </>
              ) : (
                <>
                  © 2026 EONPro, LLC. All rights reserved.
                  <br />
                  Exclusive and protected process.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
