/**
 * Form Conditional Logic Evaluator
 * 
 * Evaluates conditional logic rules to determine if a question should be displayed
 * based on the current form responses.
 * 
 * ConditionalLogic Schema:
 * {
 *   rules: [
 *     {
 *       questionId: number,        // The question to check
 *       operator: string,          // 'equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'
 *       value: string | string[],  // The value(s) to compare against
 *     }
 *   ],
 *   logic: 'AND' | 'OR',           // How to combine multiple rules
 *   action: 'show' | 'hide',       // What to do when conditions are met (default: 'show')
 * }
 */

export interface ConditionalRule {
  questionId: number;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty' | 'in' | 'not_in';
  value?: string | string[] | number;
}

export interface ConditionalLogic {
  rules: ConditionalRule[];
  logic?: 'AND' | 'OR';
  action?: 'show' | 'hide';
}

/**
 * Evaluate a single conditional rule
 */
export function evaluateRule(
  rule: ConditionalRule,
  responses: Record<number, string>
): boolean {
  const responseValue = responses[rule.questionId] || '';
  
  switch (rule.operator) {
    case 'equals':
      return responseValue === String(rule.value);
      
    case 'not_equals':
      return responseValue !== String(rule.value);
      
    case 'contains':
      if (Array.isArray(rule.value)) {
        // For checkbox responses, check if any value matches
        const responseValues = responseValue.split(',').map(v => v.trim());
        return rule.value.some(v => responseValues.includes(v));
      }
      return responseValue.toLowerCase().includes(String(rule.value).toLowerCase());
      
    case 'not_contains':
      if (Array.isArray(rule.value)) {
        const responseValues = responseValue.split(',').map(v => v.trim());
        return !rule.value.some(v => responseValues.includes(v));
      }
      return !responseValue.toLowerCase().includes(String(rule.value).toLowerCase());
      
    case 'greater_than':
      const numValue = parseFloat(responseValue);
      const compareValueGt = typeof rule.value === 'number' ? rule.value : parseFloat(String(rule.value));
      return !isNaN(numValue) && !isNaN(compareValueGt) && numValue > compareValueGt;
      
    case 'less_than':
      const numValueLt = parseFloat(responseValue);
      const compareValueLt = typeof rule.value === 'number' ? rule.value : parseFloat(String(rule.value));
      return !isNaN(numValueLt) && !isNaN(compareValueLt) && numValueLt < compareValueLt;
      
    case 'is_empty':
      return !responseValue || responseValue.trim() === '';
      
    case 'is_not_empty':
      return !!(responseValue && responseValue.trim() !== '');
      
    case 'in':
      if (Array.isArray(rule.value)) {
        return rule.value.map(v => String(v)).includes(responseValue);
      }
      return false;
      
    case 'not_in':
      if (Array.isArray(rule.value)) {
        return !rule.value.map(v => String(v)).includes(responseValue);
      }
      return true;
      
    default:
      return true;
  }
}

/**
 * Evaluate conditional logic for a question
 * Returns true if the question should be visible
 */
export function evaluateConditionalLogic(
  conditionalLogic: ConditionalLogic | null | undefined,
  responses: Record<number, string>
): boolean {
  // If no conditional logic, always show
  if (!conditionalLogic || !conditionalLogic.rules || conditionalLogic.rules.length === 0) {
    return true;
  }

  const { rules, logic = 'AND', action = 'show' } = conditionalLogic;

  // Evaluate all rules
  const results = rules.map(rule => evaluateRule(rule, responses));

  // Combine results based on logic
  let conditionMet: boolean;
  if (logic === 'OR') {
    conditionMet = results.some(r => r);
  } else {
    conditionMet = results.every(r => r);
  }

  // Apply action
  if (action === 'hide') {
    return !conditionMet;
  }
  
  return conditionMet;
}

/**
 * Get all visible questions based on current responses
 */
export function getVisibleQuestions<T extends { id: number; conditionalLogic?: any }>(
  questions: T[],
  responses: Record<number, string>
): T[] {
  return questions.filter(question => {
    return evaluateConditionalLogic(question.conditionalLogic, responses);
  });
}

/**
 * Validate that required visible questions have responses
 */
export function validateVisibleRequiredQuestions<T extends { 
  id: number; 
  isRequired: boolean;
  conditionalLogic?: any;
  questionText: string;
}>(
  questions: T[],
  responses: Record<number, string>
): { valid: boolean; errors: Record<number, string> } {
  const visibleQuestions = getVisibleQuestions(questions, responses);
  const errors: Record<number, string> = {};

  for (const question of visibleQuestions) {
    if (question.isRequired) {
      const response = responses[question.id];
      if (!response || response.trim() === '') {
        errors[question.id] = `"${question.questionText}" is required`;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Build conditional logic from a simple condition string
 * Useful for UI builders
 * 
 * Example: "Q1 equals 'Yes'" -> { rules: [{ questionId: 1, operator: 'equals', value: 'Yes' }] }
 */
export function parseSimpleCondition(condition: string): ConditionalLogic | null {
  const match = condition.match(/^Q(\d+)\s+(equals|not_equals|contains|greater_than|less_than|is_empty|is_not_empty)\s*'?([^']*)'?$/i);
  
  if (!match) {
    return null;
  }

  const [, questionIdStr, operator, value] = match;
  const questionId = parseInt(questionIdStr, 10);

  if (isNaN(questionId)) {
    return null;
  }

  return {
    rules: [{
      questionId,
      operator: operator.toLowerCase() as ConditionalRule['operator'],
      value: value || undefined,
    }],
    logic: 'AND',
    action: 'show',
  };
}

/**
 * Create a condition builder helper
 */
export class ConditionalLogicBuilder {
  private rules: ConditionalRule[] = [];
  private logic: 'AND' | 'OR' = 'AND';
  private action: 'show' | 'hide' = 'show';

  when(questionId: number): {
    equals: (value: string) => ConditionalLogicBuilder;
    notEquals: (value: string) => ConditionalLogicBuilder;
    contains: (value: string | string[]) => ConditionalLogicBuilder;
    greaterThan: (value: number) => ConditionalLogicBuilder;
    lessThan: (value: number) => ConditionalLogicBuilder;
    isEmpty: () => ConditionalLogicBuilder;
    isNotEmpty: () => ConditionalLogicBuilder;
    isIn: (values: string[]) => ConditionalLogicBuilder;
  } {
    return {
      equals: (value: string) => {
        this.rules.push({ questionId, operator: 'equals', value });
        return this;
      },
      notEquals: (value: string) => {
        this.rules.push({ questionId, operator: 'not_equals', value });
        return this;
      },
      contains: (value: string | string[]) => {
        this.rules.push({ questionId, operator: 'contains', value });
        return this;
      },
      greaterThan: (value: number) => {
        this.rules.push({ questionId, operator: 'greater_than', value });
        return this;
      },
      lessThan: (value: number) => {
        this.rules.push({ questionId, operator: 'less_than', value });
        return this;
      },
      isEmpty: () => {
        this.rules.push({ questionId, operator: 'is_empty' });
        return this;
      },
      isNotEmpty: () => {
        this.rules.push({ questionId, operator: 'is_not_empty' });
        return this;
      },
      isIn: (values: string[]) => {
        this.rules.push({ questionId, operator: 'in', value: values });
        return this;
      },
    };
  }

  or(): ConditionalLogicBuilder {
    this.logic = 'OR';
    return this;
  }

  and(): ConditionalLogicBuilder {
    this.logic = 'AND';
    return this;
  }

  thenShow(): ConditionalLogicBuilder {
    this.action = 'show';
    return this;
  }

  thenHide(): ConditionalLogicBuilder {
    this.action = 'hide';
    return this;
  }

  build(): ConditionalLogic {
    return {
      rules: this.rules,
      logic: this.logic,
      action: this.action,
    };
  }
}

/**
 * Create a new conditional logic builder
 */
export function conditionalLogic(): ConditionalLogicBuilder {
  return new ConditionalLogicBuilder();
}

// Common pre-built conditions for weight loss forms
export const WEIGHT_LOSS_CONDITIONS = {
  // Show pregnancy-related questions only for female patients
  showForFemale: conditionalLogic()
    .when(1) // Assuming question 1 is "Gender"
    .equals('Female')
    .build(),

  // Show diabetes medication questions if diabetic
  showIfDiabetic: conditionalLogic()
    .when(10) // Assuming question 10 is "Do you have diabetes?"
    .equals('Yes')
    .build(),

  // Show current medication details if taking medications
  showIfOnMedications: conditionalLogic()
    .when(15) // Assuming question 15 is "Are you currently taking any medications?"
    .equals('Yes')
    .build(),

  // Show allergy details if has allergies
  showIfHasAllergies: conditionalLogic()
    .when(20) // Assuming question 20 is "Do you have any allergies?"
    .notEquals('None')
    .build(),
};
