'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type {
  FormStep as FormStepType,
  FormBranding,
  FieldOption,
  LocalizedString,
} from '../../types/form-engine';
import { resolveNextStep } from '../../types/form-engine';
import { getStepComponent } from './StepRegistry';
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
    const CustomComponent = getStepComponent(config.component);
    if (CustomComponent) {
      return (
        <CustomComponent
          config={config}
          basePath={basePath}
          branding={branding}
          onNavigate={onNavigate}
          onBack={handleBack}
        />
      );
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
        <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 max-w-md lg:max-w-2xl mx-auto w-full">
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold text-[var(--intake-primary,#413d3d)]">
                {getText(config.title)}
              </h1>
            </div>
            <div className="space-y-4 animate-pulse">
              {config.fields.map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-full" />
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

  // ---- Layout ----

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-100">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${config.progressPercent}%` }}
        />
      </div>

      {/* Back button */}
      {config.prevStep && (
        <div className="px-6 lg:px-8 pt-6 max-w-md lg:max-w-2xl mx-auto w-full">
          <button
            onClick={handleBack}
            className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg"
            aria-label={isSpanish ? 'Volver' : 'Go back'}
          >
            <svg
              className="w-6 h-6 text-[var(--intake-primary,#413d3d)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-8">
          {/* Title */}
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--intake-primary,#413d3d)]">
              {getText(config.title)}
            </h1>
            {config.subtitle && (
              <p className="mt-3 text-base text-gray-500">
                {getText(config.subtitle)}
              </p>
            )}
          </div>

          {/* Fields */}
          <div className="space-y-4">{config.fields.map(renderField)}</div>
        </div>
      </div>

      {/* Continue button */}
      {config.showContinueButton && (
        <div className="px-6 lg:px-8 pb-6 max-w-md lg:max-w-2xl mx-auto w-full">
          <button
            onClick={handleContinue}
            className="
              w-full flex items-center justify-center gap-2 px-6 py-4
              rounded-full font-semibold text-base transition-all
              bg-[var(--intake-primary,#413d3d)] text-white
              hover:opacity-90 active:scale-[0.98]
            "
          >
            <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
