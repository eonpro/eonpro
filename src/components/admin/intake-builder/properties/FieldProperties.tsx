'use client';

import React from 'react';
import { Type } from 'lucide-react';
import FieldContentEditor from './FieldContentEditor';
import FieldValidationEditor from './FieldValidationEditor';
import FieldLogicEditor from './FieldLogicEditor';
import type {
  FormField,
  FormStep,
  FieldOption,
} from '../state/builderTypes';

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Short Text',
  textarea: 'Long Text',
  email: 'Email',
  phone: 'Phone',
  number: 'Number',
  date: 'Date',
  select: 'Dropdown',
  radio: 'Single Choice',
  checkbox: 'Multiple Choice',
  address: 'Address',
  signature: 'Signature',
  file: 'File Upload',
  hidden: 'Hidden',
};

interface FieldPropertiesProps {
  step: FormStep;
  field: FormField;
  steps: FormStep[];
  activeTab: 'content' | 'validation' | 'logic';
  onTabChange: (tab: 'content' | 'validation' | 'logic') => void;
  onUpdateField: (
    stepId: string,
    fieldId: string,
    updates: Partial<FormField>
  ) => void;
  onAddOption: (stepId: string, fieldId: string) => void;
  onDeleteOption: (
    stepId: string,
    fieldId: string,
    optionId: string
  ) => void;
  onUpdateOption: (
    stepId: string,
    fieldId: string,
    optionId: string,
    updates: Partial<FieldOption>
  ) => void;
  onReorderOptions: (
    stepId: string,
    fieldId: string,
    activeId: string,
    overId: string
  ) => void;
}

const TABS = [
  { id: 'content' as const, label: 'Content' },
  { id: 'validation' as const, label: 'Validation' },
  { id: 'logic' as const, label: 'Logic' },
];

export default function FieldProperties({
  step,
  field,
  steps,
  activeTab,
  onTabChange,
  onUpdateField,
  onAddOption,
  onDeleteOption,
  onUpdateOption,
  onReorderOptions,
}: FieldPropertiesProps) {
  const typeLabel = FIELD_TYPE_LABELS[field.type] ?? field.type;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50/50">
        <Type className="w-4 h-4 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-gray-500 block truncate">
            {typeLabel}
          </span>
          <span className="text-sm font-medium text-gray-900 truncate block">
            {field.label.en || field.storageKey || 'Untitled Field'}
          </span>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'content' && (
          <FieldContentEditor
            step={step}
            field={field}
            onUpdateField={onUpdateField}
            onAddOption={onAddOption}
            onDeleteOption={onDeleteOption}
            onUpdateOption={onUpdateOption}
            onReorderOptions={onReorderOptions}
          />
        )}
        {activeTab === 'validation' && (
          <FieldValidationEditor
            step={step}
            field={field}
            onUpdateField={onUpdateField}
          />
        )}
        {activeTab === 'logic' && (
          <FieldLogicEditor
            step={step}
            field={field}
            steps={steps}
            onUpdateField={onUpdateField}
          />
        )}
      </div>
    </div>
  );
}
