'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import LocalizedInput from '../shared/LocalizedInput';
import type { FormField, FormStep, ConditionalRule } from '../state/builderTypes';

const OPERATORS: { value: ConditionalRule['operator']; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'isEmpty', label: 'Is Empty' },
  { value: 'isNotEmpty', label: 'Is Not Empty' },
  { value: 'greaterThan', label: 'Greater Than' },
  { value: 'lessThan', label: 'Less Than' },
  { value: 'in', label: 'In' },
  { value: 'notIn', label: 'Not In' },
];

interface FieldLogicEditorProps {
  step: FormStep;
  field: FormField;
  steps: FormStep[];
  onUpdateField: (stepId: string, fieldId: string, updates: Partial<FormField>) => void;
}

function getFieldOptions(
  steps: FormStep[],
  excludeFieldId?: string
): { storageKey: string; label: string }[] {
  const options: { storageKey: string; label: string }[] = [];
  for (const step of steps) {
    for (const f of step.fields) {
      if (f.id === excludeFieldId || !f.storageKey) continue;
      options.push({
        storageKey: f.storageKey,
        label: `${step.title.en} › ${f.label.en || f.storageKey}`,
      });
    }
  }
  return options;
}

export default function FieldLogicEditor({
  step,
  field,
  steps,
  onUpdateField,
}: FieldLogicEditorProps) {
  const rules = field.conditionalDisplay ?? [];
  const fieldOptions = getFieldOptions(steps, field.id);

  const update = (updates: Partial<FormField>) => {
    onUpdateField(step.id, field.id, updates);
  };

  const setRules = (newRules: ConditionalRule[]) => {
    update({ conditionalDisplay: newRules });
  };

  const addRule = () => {
    const firstKey = fieldOptions[0]?.storageKey ?? '';
    setRules([
      ...rules,
      {
        field: firstKey,
        operator: 'equals' as const,
        value: '',
      },
    ]);
  };

  const updateRule = (index: number, ruleUpdates: Partial<ConditionalRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...ruleUpdates };
    setRules(newRules);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const logicMode = (field.props?.conditionalLogicMode as 'and' | 'or') ?? 'and';
  const setLogicMode = (mode: 'and' | 'or') => {
    update({
      props: { ...field.props, conditionalLogicMode: mode },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-600">
          Conditional Display
        </span>
        <div className="flex rounded-lg border border-gray-200 p-0.5">
          <button
            type="button"
            onClick={() => setLogicMode('and')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              logicMode === 'and'
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            AND
          </button>
          <button
            type="button"
            onClick={() => setLogicMode('or')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              logicMode === 'or'
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            OR
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Show this field only when the following conditions are met.
      </p>

      <div className="space-y-3">
        {rules.map((rule, index) => (
          <div
            key={index}
            className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-gray-500">Rule {index + 1}</span>
              <button
                type="button"
                onClick={() => removeRule(index)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove rule"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2">
              <div>
                <label className="mb-0.5 block text-[10px] font-medium text-gray-500">Field</label>
                <select
                  value={rule.field}
                  onChange={(e) => updateRule(index, { field: e.target.value })}
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {fieldOptions.map((opt) => (
                    <option key={opt.storageKey} value={opt.storageKey}>
                      {opt.label}
                    </option>
                  ))}
                  {fieldOptions.length === 0 && <option value="">No other fields</option>}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium text-gray-500">
                  Operator
                </label>
                <select
                  value={rule.operator}
                  onChange={(e) =>
                    updateRule(index, {
                      operator: e.target.value as ConditionalRule['operator'],
                    })
                  }
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </div>
              {!['isEmpty', 'isNotEmpty'].includes(rule.operator) && (
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium text-gray-500">
                    Value
                  </label>
                  <input
                    type="text"
                    value={String(rule.value ?? '')}
                    onChange={(e) =>
                      updateRule(index, {
                        value: e.target.value,
                      })
                    }
                    placeholder="Compare value"
                    className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRule}
        disabled={fieldOptions.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add Rule
      </button>

      {fieldOptions.length === 0 && rules.length === 0 && (
        <p className="text-xs text-gray-500">
          Add fields to other steps to create conditional display rules.
        </p>
      )}
    </div>
  );
}
