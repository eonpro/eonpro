/**
 * Form Builder Reducer
 *
 * Central state management for the FormConfig being edited.
 * Handles all CRUD operations on steps, fields, options, and navigation.
 * Maintains undo/redo history (50-state ring buffer).
 */

import { nanoid } from 'nanoid';
import type {
  BuilderState,
  BuilderAction,
  FormConfig,
  FormStep,
  FormField,
  FieldOption,
  FieldType,
  StepType,
  LocalizedString,
} from './builderTypes';
import { createLocalizedString, emptyLocalizedString } from './builderTypes';

const MAX_HISTORY = 50;

// ---------------------------------------------------------------------------
// ID Generators
// ---------------------------------------------------------------------------

function genStepId(): string {
  return `step-${nanoid(8)}`;
}

function genFieldId(): string {
  return `field-${nanoid(8)}`;
}

function genOptionId(): string {
  return `opt-${nanoid(6)}`;
}

// ---------------------------------------------------------------------------
// storageKey helpers
// ---------------------------------------------------------------------------

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40);
}

function uniqueStorageKey(base: string, existingKeys: Set<string>): string {
  if (!existingKeys.has(base)) return base;
  let i = 2;
  while (existingKeys.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function collectStorageKeys(config: FormConfig): Set<string> {
  const keys = new Set<string>();
  for (const step of config.steps) {
    for (const field of step.fields) {
      keys.add(field.storageKey);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Step/field factory helpers
// ---------------------------------------------------------------------------

function createDefaultStep(stepType: StepType): Omit<FormStep, 'nextStep' | 'prevStep' | 'progressPercent'> {
  const id = genStepId();
  const titles: Record<StepType, string> = {
    'single-select': 'New Question',
    'multi-select': 'Select All That Apply',
    input: 'New Input Step',
    info: 'Information',
    custom: 'Custom Step',
  };

  return {
    id,
    path: id,
    title: createLocalizedString(titles[stepType] || 'New Step'),
    type: stepType,
    fields: [],
    autoAdvance: stepType === 'single-select',
    showContinueButton: stepType !== 'single-select',
  };
}

function createDefaultField(fieldType: FieldType, existingKeys: Set<string>): FormField {
  const id = genFieldId();
  const labels: Record<string, string> = {
    text: 'Text Field',
    email: 'Email',
    phone: 'Phone Number',
    number: 'Number',
    date: 'Date',
    textarea: 'Long Text',
    select: 'Select',
    radio: 'Choice',
    checkbox: 'Checkbox',
    signature: 'Signature',
    file: 'File Upload',
    hidden: 'Hidden Field',
    address: 'Address',
  };

  const label = labels[fieldType] || 'Field';
  const storageKey = uniqueStorageKey(toSnakeCase(label), existingKeys);

  const field: FormField = {
    id,
    type: fieldType,
    label: createLocalizedString(label),
    storageKey,
    validation: [],
  };

  if (fieldType === 'radio' || fieldType === 'select') {
    field.options = [
      { id: genOptionId(), label: createLocalizedString('Option 1'), value: 'option_1' },
      { id: genOptionId(), label: createLocalizedString('Option 2'), value: 'option_2' },
    ];
  }

  if (fieldType === 'checkbox') {
    field.options = [
      { id: genOptionId(), label: createLocalizedString('Option 1'), value: 'option_1' },
      { id: genOptionId(), label: createLocalizedString('Option 2'), value: 'option_2' },
    ];
  }

  return field;
}

// ---------------------------------------------------------------------------
// Recalculation helpers
// ---------------------------------------------------------------------------

function recalcProgress(steps: FormStep[]): FormStep[] {
  if (steps.length === 0) return steps;
  return steps.map((step, i) => ({
    ...step,
    progressPercent: Math.round(((i + 1) / steps.length) * 100),
  }));
}

function recalcLinearNav(steps: FormStep[]): FormStep[] {
  return steps.map((step, i) => {
    const hasConditionalNav = Array.isArray(step.nextStep);
    return {
      ...step,
      prevStep: i === 0 ? null : steps[i - 1].id,
      nextStep: hasConditionalNav
        ? step.nextStep
        : i < steps.length - 1
          ? steps[i + 1].id
          : null,
    };
  });
}

function recalcSteps(steps: FormStep[]): FormStep[] {
  return recalcProgress(recalcLinearNav(steps));
}

// ---------------------------------------------------------------------------
// Array reorder helper
// ---------------------------------------------------------------------------

function arrayMove<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  const result = [...arr];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

// ---------------------------------------------------------------------------
// Core reducer
// ---------------------------------------------------------------------------

function applyAction(config: FormConfig, action: BuilderAction): FormConfig {
  switch (action.type) {
    // ----- Steps -----

    case 'ADD_STEP': {
      const base = createDefaultStep(action.stepType);
      const newStep: FormStep = {
        ...base,
        nextStep: null,
        prevStep: null,
        progressPercent: 0,
      };

      let steps: FormStep[];
      if (action.afterStepId) {
        const idx = config.steps.findIndex((s) => s.id === action.afterStepId);
        steps = [...config.steps];
        steps.splice(idx + 1, 0, newStep);
      } else {
        steps = [...config.steps, newStep];
      }

      const startStep = config.steps.length === 0 ? newStep.id : config.startStep;

      return { ...config, steps: recalcSteps(steps), startStep };
    }

    case 'DELETE_STEP': {
      const steps = config.steps.filter((s) => s.id !== action.stepId);
      const startStep = config.startStep === action.stepId
        ? (steps[0]?.id ?? '')
        : config.startStep;

      return { ...config, steps: recalcSteps(steps), startStep };
    }

    case 'DUPLICATE_STEP': {
      const idx = config.steps.findIndex((s) => s.id === action.stepId);
      if (idx === -1) return config;

      const source = config.steps[idx];
      const newId = genStepId();
      const existingKeys = collectStorageKeys(config);

      const duplicatedFields = source.fields.map((f) => ({
        ...f,
        id: genFieldId(),
        storageKey: uniqueStorageKey(f.storageKey, existingKeys),
      }));

      // Mark each duplicated key as used so subsequent fields don't collide
      for (const f of duplicatedFields) existingKeys.add(f.storageKey);

      const newStep: FormStep = {
        ...source,
        id: newId,
        path: newId,
        title: { ...source.title, en: `${source.title.en} (copy)` },
        fields: duplicatedFields,
        nextStep: null,
        prevStep: null,
        progressPercent: 0,
      };

      const steps = [...config.steps];
      steps.splice(idx + 1, 0, newStep);

      return { ...config, steps: recalcSteps(steps) };
    }

    case 'REORDER_STEPS': {
      const fromIdx = config.steps.findIndex((s) => s.id === action.activeId);
      const toIdx = config.steps.findIndex((s) => s.id === action.overId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return config;

      const steps = arrayMove(config.steps, fromIdx, toIdx);
      return { ...config, steps: recalcSteps(steps) };
    }

    case 'UPDATE_STEP': {
      const steps = config.steps.map((s) =>
        s.id === action.stepId ? { ...s, ...action.updates } : s,
      );
      return { ...config, steps };
    }

    case 'SET_START_STEP': {
      return { ...config, startStep: action.stepId };
    }

    // ----- Fields -----

    case 'ADD_FIELD': {
      const existingKeys = collectStorageKeys(config);
      const newField = createDefaultField(action.fieldType, existingKeys);

      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        const fields = [...s.fields];
        if (action.atIndex !== undefined && action.atIndex >= 0) {
          fields.splice(action.atIndex, 0, newField);
        } else {
          fields.push(newField);
        }
        return { ...s, fields };
      });

      return { ...config, steps };
    }

    case 'DELETE_FIELD': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        return { ...s, fields: s.fields.filter((f) => f.id !== action.fieldId) };
      });
      return { ...config, steps };
    }

    case 'DUPLICATE_FIELD': {
      const existingKeys = collectStorageKeys(config);
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        const idx = s.fields.findIndex((f) => f.id === action.fieldId);
        if (idx === -1) return s;

        const source = s.fields[idx];
        const newField: FormField = {
          ...source,
          id: genFieldId(),
          storageKey: uniqueStorageKey(source.storageKey, existingKeys),
        };

        const fields = [...s.fields];
        fields.splice(idx + 1, 0, newField);
        return { ...s, fields };
      });

      return { ...config, steps };
    }

    case 'REORDER_FIELDS': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        const fromIdx = s.fields.findIndex((f) => f.id === action.activeId);
        const toIdx = s.fields.findIndex((f) => f.id === action.overId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return s;
        return { ...s, fields: arrayMove(s.fields, fromIdx, toIdx) };
      });
      return { ...config, steps };
    }

    case 'UPDATE_FIELD': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        const fields = s.fields.map((f) =>
          f.id === action.fieldId ? { ...f, ...action.updates } : f,
        );
        return { ...s, fields };
      });
      return { ...config, steps };
    }

    case 'MOVE_FIELD_TO_STEP': {
      let movedField: FormField | undefined;
      let steps = config.steps.map((s) => {
        if (s.id !== action.fromStepId) return s;
        const idx = s.fields.findIndex((f) => f.id === action.fieldId);
        if (idx === -1) return s;
        movedField = s.fields[idx];
        return { ...s, fields: s.fields.filter((f) => f.id !== action.fieldId) };
      });

      if (!movedField) return config;

      steps = steps.map((s) => {
        if (s.id !== action.toStepId) return s;
        const fields = [...s.fields];
        if (action.atIndex !== undefined) {
          fields.splice(action.atIndex, 0, movedField!);
        } else {
          fields.push(movedField!);
        }
        return { ...s, fields };
      });

      return { ...config, steps };
    }

    // ----- Options -----

    case 'ADD_OPTION': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        const fields = s.fields.map((f) => {
          if (f.id !== action.fieldId) return f;
          const optCount = (f.options?.length ?? 0) + 1;
          const newOpt: FieldOption = {
            id: genOptionId(),
            label: createLocalizedString(`Option ${optCount}`),
            value: `option_${optCount}`,
          };
          return { ...f, options: [...(f.options ?? []), newOpt] };
        });
        return { ...s, fields };
      });
      return { ...config, steps };
    }

    case 'DELETE_OPTION': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        const fields = s.fields.map((f) => {
          if (f.id !== action.fieldId) return f;
          return { ...f, options: f.options?.filter((o) => o.id !== action.optionId) };
        });
        return { ...s, fields };
      });
      return { ...config, steps };
    }

    case 'UPDATE_OPTION': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        const fields = s.fields.map((f) => {
          if (f.id !== action.fieldId) return f;
          const options = f.options?.map((o) =>
            o.id === action.optionId ? { ...o, ...action.updates } : o,
          );
          return { ...f, options };
        });
        return { ...s, fields };
      });
      return { ...config, steps };
    }

    case 'REORDER_OPTIONS': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        const fields = s.fields.map((f) => {
          if (f.id !== action.fieldId || !f.options) return f;
          const fromIdx = f.options.findIndex((o) => o.id === action.activeId);
          const toIdx = f.options.findIndex((o) => o.id === action.overId);
          if (fromIdx === -1 || toIdx === -1) return f;
          return { ...f, options: arrayMove(f.options, fromIdx, toIdx) };
        });
        return { ...s, fields };
      });
      return { ...config, steps };
    }

    // ----- Navigation -----

    case 'SET_NEXT_STEP': {
      const steps = config.steps.map((s) =>
        s.id === action.stepId ? { ...s, nextStep: action.nextStep } : s,
      );
      return { ...config, steps };
    }

    case 'ADD_CONDITIONAL_NAV': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId) return s;
        const existing = Array.isArray(s.nextStep) ? s.nextStep : [];
        return { ...s, nextStep: [...existing, action.nav] };
      });
      return { ...config, steps };
    }

    case 'DELETE_CONDITIONAL_NAV': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId || !Array.isArray(s.nextStep)) return s;
        const navs = s.nextStep.filter((_, i) => i !== action.index);
        return { ...s, nextStep: navs.length > 0 ? navs : steps[config.steps.indexOf(s) + 1]?.id ?? null };
      });
      return { ...config, steps };
    }

    case 'UPDATE_CONDITIONAL_NAV': {
      const steps = config.steps.map((s) => {
        if (s.id !== action.stepId || !Array.isArray(s.nextStep)) return s;
        const navs = s.nextStep.map((n, i) => (i === action.index ? action.nav : n));
        return { ...s, nextStep: navs };
      });
      return { ...config, steps };
    }

    // ----- Form-level -----

    case 'UPDATE_FORM': {
      return { ...config, ...action.updates, updatedAt: new Date().toISOString() };
    }

    case 'UPDATE_BRANDING': {
      return { ...config, branding: { ...(config.branding ?? {}), ...action.updates } };
    }

    case 'SET_CONFIG': {
      return action.config;
    }

    default:
      return config;
  }
}

// ---------------------------------------------------------------------------
// History-aware reducer
// ---------------------------------------------------------------------------

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      config: previous,
      past: state.past.slice(0, -1),
      future: [state.config, ...state.future].slice(0, MAX_HISTORY),
    };
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return {
      config: next,
      past: [...state.past, state.config].slice(-MAX_HISTORY),
      future: state.future.slice(1),
    };
  }

  if (action.type === 'SET_CONFIG') {
    return { config: action.config, past: [], future: [] };
  }

  const newConfig = applyAction(state.config, action);
  if (newConfig === state.config) return state;

  return {
    config: newConfig,
    past: [...state.past, state.config].slice(-MAX_HISTORY),
    future: [],
  };
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

export function createInitialBuilderState(config?: FormConfig): BuilderState {
  const defaultConfig: FormConfig = config ?? {
    id: `form-${nanoid(8)}`,
    name: 'Untitled Form',
    version: '1',
    steps: [],
    startStep: '',
    languages: ['en', 'es'],
    defaultLanguage: 'en',
    integrations: [{ type: 'platform', triggers: ['complete'] }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { config: defaultConfig, past: [], future: [] };
}
