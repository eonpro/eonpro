'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import LocalizedInput from '../shared/LocalizedInput';
import type {
  FormStep,
  StepType,
  StepNavigation,
  ConditionalNavigation,
} from '../state/builderTypes';
import type { ConditionalRule } from '@/domains/intake/types/form-engine';

const STEP_TYPES: { value: StepType; label: string }[] = [
  { value: 'single-select', label: 'Single Select' },
  { value: 'multi-select', label: 'Multi Select' },
  { value: 'input', label: 'Input' },
  { value: 'info', label: 'Info' },
  { value: 'custom', label: 'Custom' },
];

const LAYOUTS = [
  { value: 'default' as const, label: 'Default' },
  { value: 'compact' as const, label: 'Compact' },
  { value: 'centered' as const, label: 'Centered' },
];

interface StepPropertiesProps {
  step: FormStep;
  steps: FormStep[];
  onUpdateStep: (stepId: string, updates: Partial<FormStep>) => void;
  onSetNextStep: (stepId: string, nextStep: StepNavigation) => void;
  onAddConditionalNav: (stepId: string, nav: ConditionalNavigation) => void;
  onDeleteConditionalNav: (stepId: string, index: number) => void;
  onUpdateConditionalNav: (
    stepId: string,
    index: number,
    nav: ConditionalNavigation
  ) => void;
}

function getOtherSteps(steps: FormStep[], currentStepId: string): FormStep[] {
  return steps.filter((s) => s.id !== currentStepId);
}

export default function StepProperties({
  step,
  steps,
  onUpdateStep,
  onSetNextStep,
  onAddConditionalNav,
  onDeleteConditionalNav,
  onUpdateConditionalNav,
}: StepPropertiesProps) {
  const otherSteps = getOtherSteps(steps, step.id);
  const isConditionalNav = Array.isArray(step.nextStep);
  const conditionalNavs: ConditionalNavigation[] = isConditionalNav
    ? (step.nextStep as ConditionalNavigation[])
    : [];

  const update = (updates: Partial<FormStep>) => {
    onUpdateStep(step.id, updates);
  };

  const handleDefaultNextChange = (stepId: string) => {
    if (stepId === '') {
      onSetNextStep(step.id, null);
    } else {
      onSetNextStep(step.id, stepId);
    }
  };

  const handleAddConditionalRule = () => {
    const firstField = step.fields[0];
    const fieldKey = firstField?.storageKey ?? '';
    onAddConditionalNav(step.id, {
      conditions: [
        {
          field: fieldKey,
          operator: 'equals',
          value: '',
        },
      ],
      target: otherSteps[0]?.id ?? '',
    });
  };

  const defaultNextStepId =
    typeof step.nextStep === 'string' ? step.nextStep : '';

  return (
    <div className="space-y-4">
      <LocalizedInput
        label="Title"
        value={step.title}
        onChange={(v) => update({ title: v })}
        placeholder="Step title"
      />

      <LocalizedInput
        label="Subtitle"
        value={step.subtitle ?? { en: '', es: '' }}
        onChange={(v) => update({ subtitle: v })}
        placeholder="Optional subtitle"
      />

      <div>
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
          Step Type
        </label>
        <select
          value={step.type}
          onChange={(e) => update({ type: e.target.value as StepType })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          {STEP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">
          Layout
        </label>
        <select
          value={step.layout ?? 'default'}
          onChange={(e) =>
            update({
              layout: e.target.value as 'default' | 'compact' | 'centered',
            })
          }
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          {LAYOUTS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
            Auto Advance
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={step.autoAdvance}
            onClick={() => update({ autoAdvance: !step.autoAdvance })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
              step.autoAdvance ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                step.autoAdvance ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
            Show Continue Button
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={step.showContinueButton}
            onClick={() =>
              update({ showContinueButton: !step.showContinueButton })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
              step.showContinueButton ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                step.showContinueButton ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
            Show Progress Bar
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={step.showProgress ?? true}
            onClick={() =>
              update({ showProgress: !(step.showProgress ?? true) })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
              step.showProgress !== false ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                step.showProgress !== false ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
            Show Back Button
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={step.showBackButton ?? false}
            onClick={() =>
              update({ showBackButton: !(step.showBackButton ?? false) })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
              step.showBackButton ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                step.showBackButton ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-200">
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-2">
          Navigation
        </label>

        {!isConditionalNav ? (
          <div className="space-y-2">
            <select
              value={defaultNextStepId}
              onChange={(e) => handleDefaultNextChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">— End of form —</option>
              {otherSteps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title.en || s.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddConditionalRule}
              disabled={step.fields.length === 0 || otherSteps.length === 0}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Add conditional rule
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {conditionalNavs.map((nav: ConditionalNavigation, idx: number) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">
                    Rule {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteConditionalNav(step.id, idx)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <select
                  value={nav.target}
                  onChange={(e) =>
                    onUpdateConditionalNav(step.id, idx, {
                      ...nav,
                      target: e.target.value,
                    })
                  }
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white"
                >
                  {otherSteps.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title.en || s.id}
                    </option>
                  ))}
                </select>
                {nav.conditions.map((cond: ConditionalRule, cIdx: number) => (
                  <div key={cIdx} className="flex gap-2 text-xs">
                    <select
                      value={cond.field}
                      onChange={(e) => {
                        const newConds = [...nav.conditions];
                        newConds[cIdx] = { ...cond, field: e.target.value };
                        onUpdateConditionalNav(step.id, idx, {
                          ...nav,
                          conditions: newConds,
                        });
                      }}
                      className="flex-1 px-2 py-1 border border-gray-200 rounded"
                    >
                      {step.fields.map((f) => (
                        <option key={f.id} value={f.storageKey}>
                          {f.label.en || f.storageKey}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={String(cond.value ?? '')}
                      onChange={(e) => {
                        const newConds = [...nav.conditions];
                        newConds[cIdx] = { ...cond, value: e.target.value };
                        onUpdateConditionalNav(step.id, idx, {
                          ...nav,
                          conditions: newConds,
                        });
                      }}
                      placeholder="Value"
                      className="flex-1 px-2 py-1 border border-gray-200 rounded"
                    />
                  </div>
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddConditionalRule}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Add another rule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
