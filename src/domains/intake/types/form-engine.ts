/**
 * Form Engine — Generalized Type System
 *
 * Configuration-driven intake form types adapted from the eonmeds form engine.
 * Supports multi-step wizards, conditional logic, bilingual content,
 * and pluggable custom step components.
 *
 * @module domains/intake/types/form-engine
 */

// ---------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------

export type Language = 'en' | 'es';

/** Localized string with extensible language keys. */
export interface LocalizedString {
  en: string;
  es: string;
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// Field Types
// ---------------------------------------------------------------------------

export type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'address'
  | 'signature'
  | 'file'
  | 'hidden';

export interface ValidationRule {
  type:
    | 'required'
    | 'min'
    | 'max'
    | 'minLength'
    | 'maxLength'
    | 'pattern'
    | 'email'
    | 'phone'
    | 'age'
    | 'custom';
  value?: string | number | RegExp;
  message: LocalizedString;
}

export interface ConditionalRule {
  field: string;
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'greaterThan'
    | 'lessThan'
    | 'in'
    | 'notIn'
    | 'isEmpty'
    | 'isNotEmpty';
  value: string | number | string[] | boolean;
}

export interface FieldOption {
  id: string;
  label: LocalizedString;
  value: string;
  description?: LocalizedString;
  icon?: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: LocalizedString;
  placeholder?: LocalizedString;
  description?: LocalizedString;
  options?: FieldOption[];
  validation?: ValidationRule[];
  conditionalDisplay?: ConditionalRule[];
  storageKey: string;
  defaultValue?: string | number | boolean | string[];
  props?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Step Types
// ---------------------------------------------------------------------------

export type StepType =
  | 'single-select'
  | 'multi-select'
  | 'input'
  | 'info'
  | 'custom';

export type StepNavigation = string | ConditionalNavigation[] | null;

export interface ConditionalNavigation {
  conditions: ConditionalRule[];
  target: string;
}

export interface FormStep {
  id: string;
  path: string;
  title: LocalizedString;
  subtitle?: LocalizedString;
  type: StepType;
  fields: FormField[];
  autoAdvance: boolean;
  showContinueButton: boolean;
  nextStep: StepNavigation;
  prevStep: string | null;
  progressPercent: number;

  layout?: 'default' | 'compact' | 'centered';
  showProgress?: boolean;
  showBackButton?: boolean;

  /** Name of registered custom step component (for type === 'custom'). */
  component?: string;
  props?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Form Configuration
// ---------------------------------------------------------------------------

export interface IntegrationConfig {
  type: 'airtable' | 'webhook' | 'api' | 'platform';
  endpoint?: string;
  mapping?: Record<string, string>;
  triggers?: ('complete' | 'checkpoint' | 'abandon')[];
}

export interface FormBranding {
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  borderRadius?: string;
}

export interface FormConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  treatmentType?: string;

  steps: FormStep[];
  startStep: string;

  languages: Language[];
  defaultLanguage: Language;

  integrations: IntegrationConfig[];
  branding?: FormBranding;

  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Intake State (runtime data)
// ---------------------------------------------------------------------------

export interface IntakeSessionData {
  sessionId: string;
  templateId: string;
  clinicSlug: string;
  currentStep: string;
  completedSteps: string[];
  startedAt: string;
  lastUpdatedAt: string;
  responses: Record<string, unknown>;
  qualified?: boolean;
  disqualificationReason?: string;
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export interface SubmissionResult {
  success: boolean;
  submissionId?: string;
  error?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Custom Step Component Registry
// ---------------------------------------------------------------------------

export type CustomStepComponent = React.ComponentType<CustomStepProps>;

export interface CustomStepProps {
  config: FormStep;
  basePath: string;
  branding?: FormBranding;
  onNavigate: (stepId: string) => void;
  onBack: () => void;
}

export interface StepComponentRegistration {
  name: string;
  component: CustomStepComponent;
  treatmentTypes?: string[];
}

// ---------------------------------------------------------------------------
// Navigation helpers (pure functions)
// ---------------------------------------------------------------------------

export function resolveNextStep(
  step: FormStep,
  responses: Record<string, unknown>,
): string | null {
  const { nextStep } = step;
  if (nextStep === null) return null;
  if (typeof nextStep === 'string') return nextStep;

  for (const nav of nextStep) {
    const match = nav.conditions.every((c) => evaluateCondition(c, responses));
    if (match) return nav.target;
  }
  return null;
}

export function evaluateCondition(
  rule: ConditionalRule,
  responses: Record<string, unknown>,
): boolean {
  const value = responses[rule.field];

  switch (rule.operator) {
    case 'equals':
      return value === rule.value;
    case 'notEquals':
      return value !== rule.value;
    case 'contains':
      return Array.isArray(value) && value.includes(rule.value as string);
    case 'greaterThan':
      return (
        typeof value === 'number' &&
        typeof rule.value === 'number' &&
        value > rule.value
      );
    case 'lessThan':
      return (
        typeof value === 'number' &&
        typeof rule.value === 'number' &&
        value < rule.value
      );
    case 'in':
      return (
        Array.isArray(rule.value) && rule.value.includes(value as string)
      );
    case 'notIn':
      return (
        Array.isArray(rule.value) && !rule.value.includes(value as string)
      );
    case 'isEmpty':
      return (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      );
    case 'isNotEmpty':
      return (
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0)
      );
    default:
      return false;
  }
}
