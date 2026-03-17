import { describe, it, expect } from 'vitest';
import { weightLossIntakeConfig } from '@/domains/intake/templates/weight-loss-intake';
import { resolveNextStep } from '@/domains/intake/types/form-engine';
import type { FormStep } from '@/domains/intake/types/form-engine';

describe('weightLossIntakeConfig', () => {
  const { steps, startStep } = weightLossIntakeConfig;
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  it('has a valid startStep', () => {
    expect(stepMap.has(startStep)).toBe(true);
    expect(startStep).toBe('intro');
  });

  it('has bilingual titles for every step', () => {
    for (const step of steps) {
      expect(step.title.en).toBeTruthy();
      expect(step.title.es).toBeTruthy();
    }
  });

  it('has unique step IDs', () => {
    const ids = steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique step paths', () => {
    const paths = steps.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  describe('navigation integrity', () => {
    it('every static nextStep references an existing step', () => {
      const broken: string[] = [];
      for (const step of steps) {
        if (typeof step.nextStep === 'string' && !stepMap.has(step.nextStep)) {
          broken.push(`${step.id} -> ${step.nextStep}`);
        }
      }
      expect(broken).toEqual([]);
    });

    it('every conditional nextStep target references an existing step', () => {
      const broken: string[] = [];
      for (const step of steps) {
        if (Array.isArray(step.nextStep)) {
          for (const nav of step.nextStep) {
            if (!stepMap.has(nav.target)) {
              broken.push(`${step.id} -> ${nav.target}`);
            }
          }
        }
      }
      expect(broken).toEqual([]);
    });

    it('every prevStep references an existing step', () => {
      const broken: string[] = [];
      for (const step of steps) {
        if (step.prevStep !== null && !stepMap.has(step.prevStep)) {
          broken.push(`${step.id} -> ${step.prevStep}`);
        }
      }
      expect(broken).toEqual([]);
    });

    it('every step is reachable from startStep via forward navigation', () => {
      const reachable = new Set<string>();
      const queue = [startStep];

      while (queue.length > 0) {
        const id = queue.shift()!;
        if (reachable.has(id)) continue;
        reachable.add(id);

        const step = stepMap.get(id);
        if (!step) continue;

        if (step.nextStep === null) continue;
        if (typeof step.nextStep === 'string') {
          queue.push(step.nextStep);
        } else {
          for (const nav of step.nextStep) {
            queue.push(nav.target);
          }
        }
      }

      const unreachable = steps.filter((s) => !reachable.has(s.id)).map((s) => s.id);
      expect(unreachable).toEqual([]);
    });
  });

  describe('conditional navigation logic', () => {
    it('intro leads to goals', () => {
      const step = stepMap.get('intro')!;
      expect(resolveNextStep(step, {})).toBe('goals');
      expect(step.prevStep).toBeNull();
    });

    it('goals goes back to intro', () => {
      const step = stepMap.get('goals')!;
      expect(step.prevStep).toBe('intro');
    });

    it('medical-history-overview branches by sex', () => {
      const step = stepMap.get('medical-history-overview')!;
      expect(resolveNextStep(step, { sex: 'female' })).toBe('pregnancy');
      expect(resolveNextStep(step, { sex: 'male' })).toBe('activity-level');
    });

    it('mental-health branches by has_mental_health', () => {
      const step = stepMap.get('mental-health')!;
      expect(resolveNextStep(step, { has_mental_health: 'yes' })).toBe('mental-health-conditions');
      expect(resolveNextStep(step, { has_mental_health: 'no' })).toBe('programs-include');
    });

    it('chronic-conditions branches by has_chronic_conditions', () => {
      const step = stepMap.get('chronic-conditions')!;
      expect(resolveNextStep(step, { has_chronic_conditions: 'yes' })).toBe('chronic-conditions-detail');
      expect(resolveNextStep(step, { has_chronic_conditions: 'no' })).toBe('digestive-conditions');
    });

    it('surgery branches by had_surgery', () => {
      const step = stepMap.get('surgery')!;
      expect(resolveNextStep(step, { had_surgery: 'yes' })).toBe('surgery-details');
      expect(resolveNextStep(step, { had_surgery: 'no' })).toBe('blood-pressure');
    });

    it('glp1-history branches by history status', () => {
      const step = stepMap.get('glp1-history')!;
      expect(resolveNextStep(step, { glp1_history: 'currently_taking' })).toBe('glp1-type');
      expect(resolveNextStep(step, { glp1_history: 'previously_taken' })).toBe('glp1-type');
      expect(resolveNextStep(step, { glp1_history: 'never_taken' })).toBe('recreational-drugs');
      expect(resolveNextStep(step, { glp1_history: 'considering' })).toBe('recreational-drugs');
    });

    it('glp1-type branches by medication type', () => {
      const step = stepMap.get('glp1-type')!;
      expect(resolveNextStep(step, { glp1_type: 'semaglutide' })).toBe('semaglutide-dosage');
      expect(resolveNextStep(step, { glp1_type: 'tirzepatide' })).toBe('tirzepatide-dosage');
      expect(resolveNextStep(step, { glp1_type: 'liraglutide' })).toBe('dosage-satisfaction');
      expect(resolveNextStep(step, { glp1_type: 'oral_glp1' })).toBe('dosage-satisfaction');
      expect(resolveNextStep(step, { glp1_type: 'other' })).toBe('dosage-satisfaction');
    });
  });

  describe('expected steps present', () => {
    const expectedStepIds = [
      'intro',
      'goals', 'obesity-stats', 'medication-preference', 'research-done',
      'consent', 'state', 'name', 'dob', 'sex-assigned', 'contact-info',
      'support-info', 'address', 'ideal-weight', 'current-weight',
      'bmi-calculating', 'bmi-result', 'testimonials',
      'medical-history-overview', 'pregnancy', 'activity-level',
      'mental-health', 'mental-health-conditions', 'programs-include',
      'chronic-conditions', 'chronic-conditions-detail', 'digestive-conditions',
      'kidney-conditions', 'surgery', 'surgery-details', 'blood-pressure',
      'glp1-history', 'glp1-type',
      'semaglutide-dosage', 'semaglutide-side-effects', 'semaglutide-success',
      'tirzepatide-dosage', 'tirzepatide-side-effects', 'tirzepatide-success',
      'dosage-satisfaction',
      'recreational-drugs', 'weight-loss-history', 'weight-loss-support',
      'side-effects-info', 'dosage-interest', 'glp1-data', 'alcohol-consumption',
      'safety-quality', 'medical-team', 'common-side-effects', 'personalized-treatment',
      'review', 'finding-provider', 'qualified',
    ];

    for (const id of expectedStepIds) {
      it(`has step: ${id}`, () => {
        expect(stepMap.has(id)).toBe(true);
      });
    }
  });

  describe('storageKeys', () => {
    it('all storageKeys are unique within their step', () => {
      for (const step of steps) {
        if (step.fields.length <= 1) continue;
        const keys = step.fields.map((f) => f.storageKey);
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        expect(dupes, `Duplicate storageKeys in step ${step.id}`).toEqual([]);
      }
    });

    it('critical storageKeys are present', () => {
      const allStorageKeys = new Set(
        steps.flatMap((s) => s.fields.map((f) => f.storageKey))
      );

      const expected = [
        'goals', 'medication_preference', 'consent_accepted',
        'state', 'firstName', 'lastName', 'dob', 'sex',
        'email', 'phone', 'street', 'ideal_weight', 'current_weight',
        'height_feet', 'height_inches',
        'pregnancy_status', 'activity_level',
        'has_mental_health', 'mental_health_conditions',
        'has_chronic_conditions', 'digestive_conditions',
        'has_kidney_conditions', 'had_surgery', 'surgery_types',
        'blood_pressure', 'glp1_history', 'glp1_type',
        'semaglutide_dosage', 'semaglutide_side_effects', 'semaglutide_success',
        'tirzepatide_dosage', 'tirzepatide_side_effects', 'tirzepatide_success',
        'dosage_satisfaction',
        'recreational_drugs', 'weight_loss_methods', 'weight_loss_support',
        'dosage_interest', 'alcohol_consumption', 'common_side_effects',
      ];

      const missing = expected.filter((k) => !allStorageKeys.has(k));
      expect(missing).toEqual([]);
    });
  });
});
