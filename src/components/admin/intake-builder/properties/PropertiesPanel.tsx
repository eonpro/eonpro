'use client';

import React from 'react';
import { X } from 'lucide-react';
import FormProperties from './FormProperties';
import StepProperties from './StepProperties';
import FieldProperties from './FieldProperties';
import type {
  FormStep,
  FormConfig,
  FormField,
  FormBranding,
  FieldOption,
  StepNavigation,
  ConditionalNavigation,
} from '../state/builderTypes';

export interface BuilderSelection {
  type: 'step' | 'field' | 'form' | null;
  stepId: string | null;
  fieldId: string | null;
}

export interface PropertiesPanelProps {
  selection: BuilderSelection;
  steps: FormStep[];
  config: FormConfig;
  language: 'en' | 'es';
  rightPanelTab: 'content' | 'validation' | 'logic' | 'design';
  onTabChange: (tab: 'content' | 'validation' | 'logic' | 'design') => void;
  onUpdateStep: (stepId: string, updates: Partial<FormStep>) => void;
  onUpdateField: (stepId: string, fieldId: string, updates: Partial<FormField>) => void;
  onUpdateForm: (updates: Partial<FormConfig>) => void;
  onUpdateBranding: (updates: Partial<FormBranding>) => void;
  onAddOption: (stepId: string, fieldId: string) => void;
  onDeleteOption: (stepId: string, fieldId: string, optionId: string) => void;
  onUpdateOption: (
    stepId: string,
    fieldId: string,
    optionId: string,
    updates: Partial<FieldOption>
  ) => void;
  onReorderOptions: (stepId: string, fieldId: string, activeId: string, overId: string) => void;
  onSetNextStep: (stepId: string, nextStep: StepNavigation) => void;
  onAddConditionalNav: (stepId: string, nav: ConditionalNavigation) => void;
  onDeleteConditionalNav: (stepId: string, index: number) => void;
  onUpdateConditionalNav: (stepId: string, index: number, nav: ConditionalNavigation) => void;
  onClearSelection: () => void;
}

function getHeaderTitle(selection: BuilderSelection): string {
  switch (selection.type) {
    case 'field':
      return 'Field Settings';
    case 'step':
      return 'Step Settings';
    case 'form':
      return 'Form Settings';
    default:
      return 'Form Settings';
  }
}

export default function PropertiesPanel({
  selection,
  steps,
  config,
  rightPanelTab,
  onTabChange,
  onUpdateStep,
  onUpdateField,
  onUpdateForm,
  onUpdateBranding,
  onAddOption,
  onDeleteOption,
  onUpdateOption,
  onReorderOptions,
  onSetNextStep,
  onAddConditionalNav,
  onDeleteConditionalNav,
  onUpdateConditionalNav,
  onClearSelection,
}: PropertiesPanelProps) {
  const selectedStep =
    selection.stepId != null ? steps.find((s) => s.id === selection.stepId) : undefined;
  const selectedField =
    selectedStep && selection.fieldId != null
      ? selectedStep.fields.find((f) => f.id === selection.fieldId)
      : undefined;

  const showForm = selection.type === 'form' || selection.type === null;
  const showStep = selection.type === 'step' && selectedStep;
  const showField = selection.type === 'field' && selectedStep && selectedField;

  const headerTitle = getHeaderTitle(selection);

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-200 bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{headerTitle}</h2>
        <button
          type="button"
          onClick={onClearSelection}
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showField && selectedStep && selectedField && (
          <FieldProperties
            step={selectedStep}
            field={selectedField}
            steps={steps}
            activeTab={
              rightPanelTab === 'validation'
                ? 'validation'
                : rightPanelTab === 'logic'
                  ? 'logic'
                  : 'content'
            }
            onTabChange={(tab) => onTabChange(tab as 'content' | 'validation' | 'logic' | 'design')}
            onUpdateField={onUpdateField}
            onAddOption={onAddOption}
            onDeleteOption={onDeleteOption}
            onUpdateOption={onUpdateOption}
            onReorderOptions={onReorderOptions}
          />
        )}
        {showStep && selectedStep && (
          <div className="p-4">
            <StepProperties
              step={selectedStep}
              steps={steps}
              onUpdateStep={onUpdateStep}
              onSetNextStep={onSetNextStep}
              onAddConditionalNav={onAddConditionalNav}
              onDeleteConditionalNav={onDeleteConditionalNav}
              onUpdateConditionalNav={onUpdateConditionalNav}
            />
          </div>
        )}
        {showForm && (
          <FormProperties
            config={config}
            rightPanelTab={rightPanelTab}
            onTabChange={onTabChange}
            onUpdateForm={onUpdateForm}
            onUpdateBranding={onUpdateBranding}
          />
        )}
      </div>
    </div>
  );
}
