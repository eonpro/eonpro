/**
 * Intake Domain
 *
 * Medical intake form management. Handles form templates, submissions,
 * responses, and patient data collection workflows.
 *
 * @module domains/intake
 */

// Legacy service (existing)
export { intakeService, createIntakeService } from './services/intake.service';
export type { IntakeService } from './services/intake.service';

// Form engine types
export type {
  Language,
  LocalizedString,
  FieldType,
  ValidationRule,
  ConditionalRule,
  FieldOption,
  FormField,
  StepType,
  StepNavigation,
  ConditionalNavigation,
  FormStep,
  IntegrationConfig,
  FormBranding,
  FormConfig,
  IntakeSessionData,
  SubmissionResult,
  CustomStepComponent,
  CustomStepProps,
  StepComponentRegistration,
} from './types/form-engine';

export { resolveNextStep, evaluateCondition } from './types/form-engine';
