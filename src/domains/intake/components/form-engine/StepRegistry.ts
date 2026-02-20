/**
 * Custom Step Component Registry
 *
 * Allows treatment-specific step components (BMI calculator, consent, etc.)
 * to be registered and resolved by name at runtime. The FormStep component
 * looks up custom step components here when `step.type === 'custom'`.
 */

import type {
  CustomStepComponent,
  StepComponentRegistration,
} from '../../types/form-engine';

const registry = new Map<string, StepComponentRegistration>();

export function registerStepComponent(
  registration: StepComponentRegistration,
): void {
  registry.set(registration.name, registration);
}

export function getStepComponent(name: string): CustomStepComponent | null {
  return registry.get(name)?.component ?? null;
}

export function getRegisteredSteps(): StepComponentRegistration[] {
  return Array.from(registry.values());
}

export function hasStepComponent(name: string): boolean {
  return registry.has(name);
}

/**
 * Register multiple step components at once.
 * Typically called in a setup module per treatment type.
 */
export function registerStepComponents(
  registrations: StepComponentRegistration[],
): void {
  for (const reg of registrations) {
    registerStepComponent(reg);
  }
}
