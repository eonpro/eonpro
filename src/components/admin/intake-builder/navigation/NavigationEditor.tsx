'use client';

import React from 'react';
import { Plus, X, GitBranch } from 'lucide-react';
import type { FormStep, StepNavigation, ConditionalNavigation } from '../state/builderTypes';

type NavOperator = 'equals' | 'notEquals' | 'contains' | 'in' | 'isEmpty' | 'isNotEmpty';

const OPERATORS: { value: NavOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'in' },
  { value: 'isEmpty', label: 'is empty' },
  { value: 'isNotEmpty', label: 'is not empty' },
];

export interface NavigationEditorProps {
  step: FormStep;
  allSteps: FormStep[];
  onSetNextStep: (nextStep: StepNavigation) => void;
  onAddConditionalNav: (nav: ConditionalNavigation) => void;
  onDeleteConditionalNav: (index: number) => void;
  onUpdateConditionalNav: (index: number, nav: ConditionalNavigation) => void;
  /** Optional: set default step when no conditional rule matches. Parent stores via step.defaultNextStep. */
  onSetDefaultNextStep?: (defaultStep: string | null) => void;
}

/** Collect all fields from all steps with step labels for the field picker. */
function getAllFieldsWithStepLabels(
  allSteps: FormStep[]
): { storageKey: string; label: string; stepLabel: string }[] {
  const result: { storageKey: string; label: string; stepLabel: string }[] = [];
  for (const s of allSteps) {
    const stepLabel = s.title?.en || s.id;
    for (const f of s.fields) {
      if (!f.storageKey) continue;
      result.push({
        storageKey: f.storageKey,
        label: f.label?.en || f.storageKey,
        stepLabel,
      });
    }
  }
  return result;
}

function getOtherSteps(allSteps: FormStep[], currentStepId: string): FormStep[] {
  return allSteps.filter((s) => s.id !== currentStepId);
}

/** Extended step type for default next step (when conditional). */
type StepWithDefault = FormStep & { defaultNextStep?: string | null };

export default function NavigationEditor({
  step,
  allSteps,
  onSetNextStep,
  onAddConditionalNav,
  onDeleteConditionalNav,
  onUpdateConditionalNav,
  onSetDefaultNextStep,
}: NavigationEditorProps) {
  const otherSteps = getOtherSteps(allSteps, step.id);
  const allFields = getAllFieldsWithStepLabels(allSteps);
  const isConditional = Array.isArray(step.nextStep);
  const conditionalNavs: ConditionalNavigation[] = isConditional
    ? (step.nextStep as ConditionalNavigation[])
    : [];
  const defaultNextStep = (step as StepWithDefault).defaultNextStep ?? null;

  const simpleNextStepId = typeof step.nextStep === 'string' ? step.nextStep : '';

  const handleSimpleNextChange = (value: string) => {
    if (value === '') {
      onSetNextStep(null);
    } else {
      onSetNextStep(value);
    }
  };

  const switchToConditional = () => {
    const firstField = allFields[0];
    const firstStep = otherSteps[0];
    if (!firstStep) return;
    onAddConditionalNav({
      conditions: [
        {
          field: firstField?.storageKey ?? '',
          operator: 'equals',
          value: '',
        },
      ],
      target: firstStep.id,
    });
  };

  const switchToSimple = () => {
    const fallback = defaultNextStep ?? otherSteps[0]?.id ?? null;
    onSetNextStep(fallback ?? '');
  };

  const handleAddRule = () => {
    const firstField = allFields[0];
    const firstStep = otherSteps[0];
    if (!firstStep) return;
    onAddConditionalNav({
      conditions: [
        {
          field: firstField?.storageKey ?? '',
          operator: 'equals',
          value: '',
        },
      ],
      target: firstStep.id,
    });
  };

  const valueNeeded = (op: string) => op !== 'isEmpty' && op !== 'isNotEmpty';

  const getStepLabel = (stepId: string) => {
    if (stepId === '') return '(End form)';
    const s = allSteps.find((x) => x.id === stepId);
    return s ? s.title?.en || s.id : stepId;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-gray-600">
          Next step
        </label>
        {isConditional && (
          <button
            type="button"
            onClick={switchToSimple}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Switch to simple
          </button>
        )}
      </div>

      {!isConditional ? (
        <div className="space-y-2">
          <select
            value={simpleNextStepId}
            onChange={(e) => handleSimpleNextChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">(End form)</option>
            {otherSteps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title?.en || s.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={switchToConditional}
            disabled={allFields.length === 0 || otherSteps.length === 0}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Add branching logic
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {conditionalNavs.map((nav: ConditionalNavigation, idx: number) => {
            const cond = nav.conditions[0];
            const op = (cond?.operator ?? 'equals') as NavOperator;
            return (
              <div
                key={idx}
                className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-xs font-medium text-gray-600">Rule {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteConditionalNav(idx)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete rule"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="sr-only">Field</label>
                    <select
                      value={cond?.field ?? ''}
                      onChange={(e) => {
                        const newConds = [...nav.conditions];
                        newConds[0] = {
                          ...(cond ?? { field: '', operator: 'equals', value: '' }),
                          field: e.target.value,
                        };
                        onUpdateConditionalNav(idx, { ...nav, conditions: newConds });
                      }}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">Select field</option>
                      {allFields.map((f) => (
                        <option key={f.storageKey} value={f.storageKey}>
                          {f.stepLabel} → {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={op}
                      onChange={(e) => {
                        const newOp = e.target.value as NavOperator;
                        const newConds = [...nav.conditions];
                        newConds[0] = {
                          ...(cond ?? { field: '', operator: 'equals', value: '' }),
                          operator: newOp,
                          value: valueNeeded(newOp) ? (cond?.value ?? '') : '',
                        };
                        onUpdateConditionalNav(idx, { ...nav, conditions: newConds });
                      }}
                      className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                    >
                      {OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {valueNeeded(op) && (
                      <input
                        type="text"
                        value={String(cond?.value ?? '')}
                        onChange={(e) => {
                          const newConds = [...nav.conditions];
                          newConds[0] = {
                            ...(cond ?? { field: '', operator: 'equals', value: '' }),
                            value: e.target.value,
                          };
                          onUpdateConditionalNav(idx, { ...nav, conditions: newConds });
                        }}
                        placeholder="Value"
                        className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1.5 text-sm"
                      />
                    )}
                  </div>
                  <div>
                    <label className="sr-only">Target step</label>
                    <select
                      value={nav.target}
                      onChange={(e) =>
                        onUpdateConditionalNav(idx, { ...nav, target: e.target.value })
                      }
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">(End form)</option>
                      {otherSteps.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title?.en || s.id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={handleAddRule}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add rule
          </button>

          {onSetDefaultNextStep && (
            <div className="border-t border-gray-200 pt-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Default (fallback)
              </label>
              <select
                value={defaultNextStep ?? ''}
                onChange={(e) =>
                  onSetDefaultNextStep(e.target.value === '' ? null : e.target.value)
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">(End form)</option>
                {otherSteps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title?.en || s.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Visual flow hint */}
          {conditionalNavs.length > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <p className="text-xs text-gray-500">
                {conditionalNavs.map((nav: ConditionalNavigation, i: number) => {
                  const c = nav.conditions[0];
                  const fieldLabel =
                    allFields.find((f) => f.storageKey === c?.field)?.label ?? c?.field;
                  const opLabel =
                    OPERATORS.find((o) => o.value === c?.operator)?.label ?? c?.operator;
                  const val = valueNeeded(c?.operator ?? '') ? c?.value : '';
                  const targetLabel = getStepLabel(nav.target);
                  return (
                    <span key={i}>
                      {i > 0 && ' · '}
                      If {fieldLabel} {opLabel} {val ? `"${val}"` : ''} → {targetLabel}
                    </span>
                  );
                })}
                {defaultNextStep != null && defaultNextStep !== '' && (
                  <span> · else → {getStepLabel(defaultNextStep)}</span>
                )}
                {(defaultNextStep == null || defaultNextStep === '') &&
                  conditionalNavs.length > 0 && <span> · else → (End form)</span>}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
