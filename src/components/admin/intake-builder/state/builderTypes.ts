/**
 * Form Builder — Type Definitions
 *
 * Builder-specific types, action discriminated union, and selection state.
 * Imports form-engine types read-only; does not modify them.
 */

import type {
  FormConfig,
  FormStep,
  FormField,
  FormBranding,
  FieldType,
  StepType,
  FieldOption,
  StepNavigation,
  ConditionalNavigation,
  ConditionalRule,
  LocalizedString,
} from '@/domains/intake/types/form-engine';

// Re-export for convenience within the builder
export type {
  FormConfig,
  FormStep,
  FormField,
  FormBranding,
  FieldType,
  StepType,
  FieldOption,
  StepNavigation,
  ConditionalNavigation,
  ConditionalRule,
  LocalizedString,
};

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------

export type SelectionType = 'step' | 'field' | 'form' | null;

export interface BuilderSelection {
  type: SelectionType;
  stepId: string | null;
  fieldId: string | null;
}

// ---------------------------------------------------------------------------
// Builder UI state
// ---------------------------------------------------------------------------

export type LeftPanelTab = 'steps' | 'elements';
export type DevicePreview = 'mobile' | 'tablet' | 'desktop';
export type BuilderLanguage = 'en' | 'es';
export type RightPanelTab = 'content' | 'validation' | 'logic' | 'design';
export type BuilderView = 'builder' | 'preview' | 'json';

export interface BuilderUIState {
  leftPanelTab: LeftPanelTab;
  rightPanelTab: RightPanelTab;
  builderView: BuilderView;
  devicePreview: DevicePreview;
  language: BuilderLanguage;
  selection: BuilderSelection;
  previewStepId: string | null;
  showFlowDiagram: boolean;
}

// ---------------------------------------------------------------------------
// Save state
// ---------------------------------------------------------------------------

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

// ---------------------------------------------------------------------------
// Reducer actions
// ---------------------------------------------------------------------------

export type BuilderAction =
  // Steps
  | { type: 'ADD_STEP'; stepType: StepType; afterStepId?: string }
  | { type: 'DELETE_STEP'; stepId: string }
  | { type: 'DUPLICATE_STEP'; stepId: string }
  | { type: 'REORDER_STEPS'; activeId: string; overId: string }
  | { type: 'UPDATE_STEP'; stepId: string; updates: Partial<FormStep> }
  | { type: 'SET_START_STEP'; stepId: string }
  // Fields
  | { type: 'ADD_FIELD'; stepId: string; fieldType: FieldType; atIndex?: number }
  | { type: 'DELETE_FIELD'; stepId: string; fieldId: string }
  | { type: 'DUPLICATE_FIELD'; stepId: string; fieldId: string }
  | { type: 'REORDER_FIELDS'; stepId: string; activeId: string; overId: string }
  | { type: 'UPDATE_FIELD'; stepId: string; fieldId: string; updates: Partial<FormField> }
  | { type: 'MOVE_FIELD_TO_STEP'; fromStepId: string; toStepId: string; fieldId: string; atIndex?: number }
  // Field options
  | { type: 'ADD_OPTION'; stepId: string; fieldId: string }
  | { type: 'DELETE_OPTION'; stepId: string; fieldId: string; optionId: string }
  | { type: 'UPDATE_OPTION'; stepId: string; fieldId: string; optionId: string; updates: Partial<FieldOption> }
  | { type: 'REORDER_OPTIONS'; stepId: string; fieldId: string; activeId: string; overId: string }
  // Navigation
  | { type: 'SET_NEXT_STEP'; stepId: string; nextStep: StepNavigation }
  | { type: 'ADD_CONDITIONAL_NAV'; stepId: string; nav: ConditionalNavigation }
  | { type: 'DELETE_CONDITIONAL_NAV'; stepId: string; index: number }
  | { type: 'UPDATE_CONDITIONAL_NAV'; stepId: string; index: number; nav: ConditionalNavigation }
  // Form-level
  | { type: 'UPDATE_FORM'; updates: Partial<FormConfig> }
  | { type: 'UPDATE_BRANDING'; updates: Partial<FormBranding> }
  // Bulk
  | { type: 'SET_CONFIG'; config: FormConfig }
  // History
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ---------------------------------------------------------------------------
// Reducer state (wraps FormConfig + undo history)
// ---------------------------------------------------------------------------

export interface BuilderState {
  config: FormConfig;
  past: FormConfig[];
  future: FormConfig[];
}

// ---------------------------------------------------------------------------
// Element definition (for the palette)
// ---------------------------------------------------------------------------

export interface ElementDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: 'input' | 'selection' | 'content' | 'special';
  fieldType: FieldType;
  stepType?: StepType;
  defaultField: Partial<FormField>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createLocalizedString(en: string, es?: string): LocalizedString {
  return { en, es: es ?? en };
}

export function emptyLocalizedString(): LocalizedString {
  return { en: '', es: '' };
}
