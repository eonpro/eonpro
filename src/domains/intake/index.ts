/**
 * Intake Domain
 *
 * Medical intake form management. Handles form templates, submissions,
 * responses, and patient data collection workflows.
 *
 * @module domains/intake
 */

// ---------------------------------------------------------------------------
// Legacy service
// ---------------------------------------------------------------------------

export { intakeService, createIntakeService } from './services/intake.service';
export type { IntakeService } from './services/intake.service';

// ---------------------------------------------------------------------------
// Form engine types & helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Form engine components
// ---------------------------------------------------------------------------

export {
  FormStep as FormStepComponent,
  registerStepComponent,
  registerStepComponents,
  getStepComponent,
  getRegisteredSteps,
  hasStepComponent,
} from './components/form-engine';

export {
  TextField,
  TextAreaField,
  SelectField,
  CheckboxField,
  OptionButton,
  SignatureField,
  FileUploadField,
} from './components/form-engine';

// ---------------------------------------------------------------------------
// Language context (client-side)
// ---------------------------------------------------------------------------

export { LanguageProvider, useLanguage } from './contexts/LanguageContext';

// ---------------------------------------------------------------------------
// Zustand store (client-side)
// ---------------------------------------------------------------------------

export {
  useIntakeStore,
  useSessionId,
  useCurrentStep,
  useCompletedSteps,
  useResponses,
  useResponse,
  useIntakeActions,
} from './store/intakeStore';

// ---------------------------------------------------------------------------
// Lead transition service (server-side)
// ---------------------------------------------------------------------------

export {
  transitionLeadToActive,
  shouldShowLeadPortal,
} from './services/lead-transition.service';

// ---------------------------------------------------------------------------
// Template library
// ---------------------------------------------------------------------------

export { weightLossIntakeConfig } from './templates/weight-loss-intake';
