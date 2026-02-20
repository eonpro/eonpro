/**
 * Intake Domain
 *
 * Medical intake form management. Handles form templates, submissions,
 * responses, and patient data collection workflows.
 *
 * SERVER-SAFE BARREL — This file must ONLY export types, pure functions,
 * and server-side services.  React components, Zustand stores, React
 * contexts, and heavy template configs must be imported via direct paths
 * (e.g. `@/domains/intake/store/intakeStore`).  This prevents client-side
 * code from leaking into Vercel serverless bundles.
 *
 * @module domains/intake
 */

// ---------------------------------------------------------------------------
// Legacy service
// ---------------------------------------------------------------------------

export { intakeService, createIntakeService } from './services/intake.service';
export type { IntakeService } from './services/intake.service';

// ---------------------------------------------------------------------------
// Form engine types & pure helpers (tree-shake to zero at runtime)
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
// Lead transition service (server-side)
// ---------------------------------------------------------------------------

export {
  transitionLeadToActive,
  shouldShowLeadPortal,
} from './services/lead-transition.service';
