/**
 * Form Engine Type System Tests
 * =============================
 *
 * Tests for the pure functions: resolveNextStep and evaluateCondition.
 * These are the core navigation and conditional logic of the intake engine.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveNextStep,
  evaluateCondition,
} from '@/domains/intake/types/form-engine';
import type {
  FormStep,
  ConditionalRule,
  ConditionalNavigation,
} from '@/domains/intake/types/form-engine';

function makeStep(overrides: Partial<FormStep> = {}): FormStep {
  return {
    id: 'test-step',
    path: '/test',
    title: { en: 'Test', es: 'Prueba' },
    type: 'input',
    fields: [],
    autoAdvance: false,
    showContinueButton: true,
    nextStep: null,
    prevStep: null,
    progressPercent: 50,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// evaluateCondition
// ---------------------------------------------------------------------------

describe('evaluateCondition', () => {
  const rule = (
    field: string,
    operator: ConditionalRule['operator'],
    value: ConditionalRule['value'],
  ): ConditionalRule => ({ field, operator, value });

  describe('equals', () => {
    it('returns true when value matches', () => {
      expect(evaluateCondition(rule('sex', 'equals', 'male'), { sex: 'male' })).toBe(true);
    });

    it('returns false when value differs', () => {
      expect(evaluateCondition(rule('sex', 'equals', 'male'), { sex: 'female' })).toBe(false);
    });

    it('returns false when field is missing', () => {
      expect(evaluateCondition(rule('sex', 'equals', 'male'), {})).toBe(false);
    });
  });

  describe('notEquals', () => {
    it('returns true when value differs', () => {
      expect(evaluateCondition(rule('sex', 'notEquals', 'male'), { sex: 'female' })).toBe(true);
    });

    it('returns false when value matches', () => {
      expect(evaluateCondition(rule('sex', 'notEquals', 'male'), { sex: 'male' })).toBe(false);
    });

    it('returns true when field is missing (undefined !== value)', () => {
      expect(evaluateCondition(rule('sex', 'notEquals', 'male'), {})).toBe(true);
    });
  });

  describe('contains', () => {
    it('returns true when array contains value', () => {
      expect(
        evaluateCondition(rule('goals', 'contains', 'weight-loss'), {
          goals: ['weight-loss', 'energy'],
        }),
      ).toBe(true);
    });

    it('returns false when array does not contain value', () => {
      expect(
        evaluateCondition(rule('goals', 'contains', 'hair'), {
          goals: ['weight-loss', 'energy'],
        }),
      ).toBe(false);
    });

    it('returns false when field is not an array', () => {
      expect(
        evaluateCondition(rule('goals', 'contains', 'weight-loss'), {
          goals: 'weight-loss',
        }),
      ).toBe(false);
    });
  });

  describe('greaterThan / lessThan', () => {
    it('greaterThan returns true when numeric value is larger', () => {
      expect(evaluateCondition(rule('age', 'greaterThan', 18), { age: 25 })).toBe(true);
    });

    it('greaterThan returns false when equal', () => {
      expect(evaluateCondition(rule('age', 'greaterThan', 18), { age: 18 })).toBe(false);
    });

    it('greaterThan returns false for non-numeric response', () => {
      expect(evaluateCondition(rule('age', 'greaterThan', 18), { age: 'twenty' })).toBe(false);
    });

    it('lessThan returns true when numeric value is smaller', () => {
      expect(evaluateCondition(rule('bmi', 'lessThan', 30), { bmi: 22.5 })).toBe(true);
    });

    it('lessThan returns false when larger', () => {
      expect(evaluateCondition(rule('bmi', 'lessThan', 30), { bmi: 35 })).toBe(false);
    });
  });

  describe('in / notIn', () => {
    it('in returns true when value is in the set', () => {
      expect(
        evaluateCondition(rule('state', 'in', ['CA', 'TX', 'FL']), { state: 'TX' }),
      ).toBe(true);
    });

    it('in returns false when value is not in the set', () => {
      expect(
        evaluateCondition(rule('state', 'in', ['CA', 'TX', 'FL']), { state: 'NY' }),
      ).toBe(false);
    });

    it('notIn returns true when value is not in the set', () => {
      expect(
        evaluateCondition(rule('state', 'notIn', ['CA', 'TX']), { state: 'NY' }),
      ).toBe(true);
    });

    it('notIn returns false when value is in the set', () => {
      expect(
        evaluateCondition(rule('state', 'notIn', ['CA', 'TX']), { state: 'CA' }),
      ).toBe(false);
    });
  });

  describe('isEmpty / isNotEmpty', () => {
    it('isEmpty returns true for undefined', () => {
      expect(evaluateCondition(rule('field', 'isEmpty', true), {})).toBe(true);
    });

    it('isEmpty returns true for null', () => {
      expect(evaluateCondition(rule('field', 'isEmpty', true), { field: null })).toBe(true);
    });

    it('isEmpty returns true for empty string', () => {
      expect(evaluateCondition(rule('field', 'isEmpty', true), { field: '' })).toBe(true);
    });

    it('isEmpty returns true for empty array', () => {
      expect(evaluateCondition(rule('field', 'isEmpty', true), { field: [] })).toBe(true);
    });

    it('isEmpty returns false for non-empty value', () => {
      expect(evaluateCondition(rule('field', 'isEmpty', true), { field: 'hello' })).toBe(false);
    });

    it('isNotEmpty returns true for non-empty string', () => {
      expect(evaluateCondition(rule('field', 'isNotEmpty', true), { field: 'hello' })).toBe(true);
    });

    it('isNotEmpty returns false for empty string', () => {
      expect(evaluateCondition(rule('field', 'isNotEmpty', true), { field: '' })).toBe(false);
    });

    it('isNotEmpty returns false for undefined', () => {
      expect(evaluateCondition(rule('field', 'isNotEmpty', true), {})).toBe(false);
    });
  });

  describe('unknown operator', () => {
    it('returns false for unrecognized operator', () => {
      expect(
        evaluateCondition(
          { field: 'x', operator: 'regex' as never, value: '.*' },
          { x: 'test' },
        ),
      ).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveNextStep
// ---------------------------------------------------------------------------

describe('resolveNextStep', () => {
  it('returns null when nextStep is null', () => {
    const step = makeStep({ nextStep: null });
    expect(resolveNextStep(step, {})).toBeNull();
  });

  it('returns the string when nextStep is a static string', () => {
    const step = makeStep({ nextStep: 'step-2' });
    expect(resolveNextStep(step, {})).toBe('step-2');
  });

  it('resolves first matching conditional navigation', () => {
    const conditionalNav: ConditionalNavigation[] = [
      {
        conditions: [{ field: 'sex', operator: 'equals', value: 'female' }],
        target: 'female-health',
      },
      {
        conditions: [{ field: 'sex', operator: 'equals', value: 'male' }],
        target: 'male-health',
      },
    ];

    const step = makeStep({ nextStep: conditionalNav });

    expect(resolveNextStep(step, { sex: 'female' })).toBe('female-health');
    expect(resolveNextStep(step, { sex: 'male' })).toBe('male-health');
  });

  it('returns null when no conditional navigation matches', () => {
    const conditionalNav: ConditionalNavigation[] = [
      {
        conditions: [{ field: 'plan', operator: 'equals', value: 'premium' }],
        target: 'premium-flow',
      },
    ];

    const step = makeStep({ nextStep: conditionalNav });
    expect(resolveNextStep(step, { plan: 'basic' })).toBeNull();
  });

  it('requires ALL conditions in a navigation entry to match', () => {
    const conditionalNav: ConditionalNavigation[] = [
      {
        conditions: [
          { field: 'age', operator: 'greaterThan', value: 18 },
          { field: 'state', operator: 'in', value: ['CA', 'TX'] },
        ],
        target: 'eligible',
      },
    ];

    const step = makeStep({ nextStep: conditionalNav });

    expect(resolveNextStep(step, { age: 25, state: 'CA' })).toBe('eligible');
    expect(resolveNextStep(step, { age: 25, state: 'NY' })).toBeNull();
    expect(resolveNextStep(step, { age: 16, state: 'CA' })).toBeNull();
  });

  it('picks the first match when multiple routes could match', () => {
    const conditionalNav: ConditionalNavigation[] = [
      {
        conditions: [{ field: 'score', operator: 'greaterThan', value: 80 }],
        target: 'high-score',
      },
      {
        conditions: [{ field: 'score', operator: 'greaterThan', value: 50 }],
        target: 'mid-score',
      },
    ];

    const step = makeStep({ nextStep: conditionalNav });
    expect(resolveNextStep(step, { score: 90 })).toBe('high-score');
  });
});
