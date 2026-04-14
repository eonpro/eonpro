'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import LocalizedInput from '../shared/LocalizedInput';
import type { FormField, FormStep } from '../state/builderTypes';
import type { ValidationRule } from '@/domains/intake/types/form-engine';
import { createLocalizedString } from '../state/builderTypes';

const VALIDATION_RULE_TYPES = [
  { value: 'required' as const, label: 'Required' },
  { value: 'minLength' as const, label: 'Min Length' },
  { value: 'maxLength' as const, label: 'Max Length' },
  { value: 'pattern' as const, label: 'Pattern (Regex)' },
  { value: 'min' as const, label: 'Min Value' },
  { value: 'max' as const, label: 'Max Value' },
  { value: 'email' as const, label: 'Email Format' },
  { value: 'phone' as const, label: 'Phone Format' },
] as const;

type ValidationRuleType = ValidationRule['type'];

function getApplicableRules(fieldType: string): ValidationRuleType[] {
  const text: ValidationRuleType[] = ['required', 'minLength', 'maxLength', 'pattern'];
  const number: ValidationRuleType[] = ['required', 'min', 'max'];
  const email: ValidationRuleType[] = ['required', 'email'];
  const phone: ValidationRuleType[] = ['required', 'phone'];

  if (['text', 'textarea'].includes(fieldType)) return text;
  if (fieldType === 'number') return number;
  if (fieldType === 'email') return email;
  if (fieldType === 'phone') return phone;
  return [...text, 'required'];
}

interface FieldValidationEditorProps {
  step: FormStep;
  field: FormField;
  onUpdateField: (stepId: string, fieldId: string, updates: Partial<FormField>) => void;
}

export default function FieldValidationEditor({
  step,
  field,
  onUpdateField,
}: FieldValidationEditorProps) {
  const rules = field.validation ?? [];
  const applicableTypes = getApplicableRules(field.type);

  const update = (updates: Partial<FormField>) => {
    onUpdateField(step.id, field.id, updates);
  };

  const setRules = (newRules: ValidationRule[]) => {
    update({ validation: newRules });
  };

  const updateRule = (index: number, ruleUpdates: Partial<ValidationRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...ruleUpdates };
    setRules(newRules);
  };

  const addRule = (type: ValidationRule['type']) => {
    const newRule: ValidationRule = {
      type,
      message: createLocalizedString(`Validation failed`),
    };
    if (type === 'minLength' || type === 'maxLength') {
      newRule.value = type === 'minLength' ? 1 : 255;
    }
    if (type === 'min' || type === 'max') {
      newRule.value = type === 'min' ? 0 : 999;
    }
    setRules([...rules, newRule]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const requiredRule = rules.find((r) => r.type === 'required');
  const isRequired = !!requiredRule;

  const toggleRequired = () => {
    if (isRequired) {
      setRules(rules.filter((r) => r.type !== 'required'));
    } else {
      addRule('required');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-gray-600">
          Required
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={isRequired}
          onClick={toggleRequired}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:ring-offset-2 ${
            isRequired ? 'bg-indigo-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
              isRequired ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {rules
        .filter((r) => r.type !== 'required')
        .map((rule, idx) => {
          const actualIndex = rules.indexOf(rule);
          return (
            <div
              key={`${rule.type}-${actualIndex}`}
              className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium capitalize text-gray-700">{rule.type}</span>
                <button
                  type="button"
                  onClick={() => removeRule(actualIndex)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove rule"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {(rule.type === 'minLength' ||
                rule.type === 'maxLength' ||
                rule.type === 'min' ||
                rule.type === 'max' ||
                rule.type === 'pattern') && (
                <input
                  type={rule.type === 'pattern' ? 'text' : 'number'}
                  value={
                    rule.type === 'pattern' ? String(rule.value ?? '') : Number(rule.value ?? 0)
                  }
                  onChange={(e) =>
                    updateRule(actualIndex, {
                      value:
                        rule.type === 'pattern'
                          ? e.target.value
                          : parseInt(e.target.value, 10) || 0,
                    })
                  }
                  placeholder={rule.type === 'pattern' ? 'e.g. ^[A-Z]+$' : undefined}
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              )}
              <LocalizedInput
                label="Error Message"
                value={rule.message}
                onChange={(v) => updateRule(actualIndex, { message: v })}
                placeholder="Validation error message"
              />
            </div>
          );
        })}

      <div className="pt-2">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-600">
          Add Validation Rule
        </label>
        <div className="flex flex-wrap gap-1">
          {VALIDATION_RULE_TYPES.filter(
            (t) =>
              t.value !== 'required' &&
              applicableTypes.includes(t.value) &&
              !rules.some((r) => r.type === t.value)
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => addRule(t.value)}
              className="inline-flex items-center gap-1 rounded border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <Plus className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
