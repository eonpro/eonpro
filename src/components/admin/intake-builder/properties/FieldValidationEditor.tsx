'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import LocalizedInput from '../shared/LocalizedInput';
import type {
  FormField,
  FormStep,
  ValidationRule,
} from '../state/builderTypes';
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

function getApplicableRules(fieldType: string): (typeof VALIDATION_RULE_TYPES)[number]['value'][] {
  const all = ['required', 'minLength', 'maxLength', 'pattern', 'min', 'max', 'email', 'phone'];
  const text = ['required', 'minLength', 'maxLength', 'pattern'];
  const number = ['required', 'min', 'max'];
  const email = ['required', 'email'];
  const phone = ['required', 'phone'];

  if (['text', 'textarea'].includes(fieldType)) return text;
  if (fieldType === 'number') return number;
  if (fieldType === 'email') return email;
  if (fieldType === 'phone') return phone;
  return [...text, 'required'];
}

interface FieldValidationEditorProps {
  step: FormStep;
  field: FormField;
  onUpdateField: (
    stepId: string,
    fieldId: string,
    updates: Partial<FormField>
  ) => void;
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
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
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
              className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700 capitalize">
                  {rule.type}
                </span>
                <button
                  type="button"
                  onClick={() => removeRule(actualIndex)}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  aria-label="Remove rule"
                >
                  <Trash2 className="w-4 h-4" />
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
                    rule.type === 'pattern'
                      ? String(rule.value ?? '')
                      : Number(rule.value ?? 0)
                  }
                  onChange={(e) =>
                    updateRule(actualIndex, {
                      value:
                        rule.type === 'pattern'
                          ? e.target.value
                          : parseInt(e.target.value, 10) || 0,
                    })
                  }
                  placeholder={
                    rule.type === 'pattern' ? 'e.g. ^[A-Z]+$' : undefined
                  }
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-2">
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
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded border border-indigo-200"
            >
              <Plus className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
