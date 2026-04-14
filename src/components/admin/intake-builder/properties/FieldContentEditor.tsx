'use client';

import React from 'react';
import LocalizedInput from '../shared/LocalizedInput';
import OptionListEditor from './OptionListEditor';
import type { FormField, FormStep, FieldType, FieldOption } from '../state/builderTypes';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'radio', label: 'Single Choice' },
  { value: 'checkbox', label: 'Multiple Choice' },
  { value: 'address', label: 'Address' },
  { value: 'signature', label: 'Signature' },
  { value: 'file', label: 'File Upload' },
  { value: 'hidden', label: 'Hidden Field' },
];

const PLACEHOLDER_TYPES: FieldType[] = [
  'text',
  'email',
  'phone',
  'number',
  'date',
  'textarea',
  'select',
];

const OPTION_TYPES: FieldType[] = ['radio', 'checkbox', 'select'];

interface FieldContentEditorProps {
  step: FormStep;
  field: FormField;
  onUpdateField: (stepId: string, fieldId: string, updates: Partial<FormField>) => void;
  onAddOption: (stepId: string, fieldId: string) => void;
  onDeleteOption: (stepId: string, fieldId: string, optionId: string) => void;
  onUpdateOption: (
    stepId: string,
    fieldId: string,
    optionId: string,
    updates: Partial<FieldOption>
  ) => void;
  onReorderOptions: (stepId: string, fieldId: string, activeId: string, overId: string) => void;
}

export default function FieldContentEditor({
  step,
  field,
  onUpdateField,
  onAddOption,
  onDeleteOption,
  onUpdateOption,
  onReorderOptions,
}: FieldContentEditorProps) {
  const update = (updates: Partial<FormField>) => {
    onUpdateField(step.id, field.id, updates);
  };

  const showPlaceholder = PLACEHOLDER_TYPES.includes(field.type);
  const showOptions = OPTION_TYPES.includes(field.type);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
          Field Type
        </label>
        <select
          value={field.type}
          onChange={(e) => update({ type: e.target.value as FieldType })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <LocalizedInput
        label="Label"
        value={field.label}
        onChange={(v) => update({ label: v })}
        placeholder="Field label"
      />

      {showPlaceholder && (
        <LocalizedInput
          label="Placeholder"
          value={field.placeholder ?? { en: '', es: '' }}
          onChange={(v) => update({ placeholder: v })}
          placeholder="Placeholder text"
        />
      )}

      <LocalizedInput
        label="Description"
        value={field.description ?? { en: '', es: '' }}
        onChange={(v) => update({ description: v })}
        placeholder="Help text (optional)"
        multiline
        rows={2}
      />

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
          Storage Key
        </label>
        <input
          type="text"
          value={field.storageKey}
          onChange={(e) => update({ storageKey: e.target.value })}
          placeholder="e.g. first_name"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <p className="mt-1 text-[10px] text-gray-500">
          Used to store responses. Auto-generated from label if empty.
        </p>
      </div>

      {!['hidden', 'signature', 'file'].includes(field.type) && (
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-600">
            Default Value
          </label>
          <input
            type="text"
            value={String(field.defaultValue ?? '')}
            onChange={(e) =>
              update({
                defaultValue: e.target.value || undefined,
              })
            }
            placeholder="Optional default"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )}

      {showOptions && (
        <OptionListEditor
          options={field.options ?? []}
          stepId={step.id}
          fieldId={field.id}
          onAddOption={onAddOption}
          onDeleteOption={onDeleteOption}
          onUpdateOption={onUpdateOption}
          onReorderOptions={onReorderOptions}
        />
      )}
    </div>
  );
}
