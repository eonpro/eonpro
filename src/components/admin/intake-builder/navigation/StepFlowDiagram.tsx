'use client';

import React, { useRef } from 'react';
import { ArrowRight, Diamond, Play, Flag } from 'lucide-react';
import type { FormStep } from '../state/builderTypes';

export interface StepFlowDiagramProps {
  steps: FormStep[];
  startStepId: string;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
}

const TRUNCATE_LEN = 12;

function truncate(str: string, len: number = TRUNCATE_LEN): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}

export default function StepFlowDiagram({
  steps,
  startStepId,
  selectedStepId,
  onSelectStep,
}: StepFlowDiagramProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const stepIndex = new Map(steps.map((s, i) => [s.id, i]));

  const getStepTitle = (step: FormStep) => truncate(step.title?.en || step.id, TRUNCATE_LEN);

  const isTerminal = (step: FormStep) => {
    if (step.nextStep === null) return true;
    if (typeof step.nextStep === 'string' && step.nextStep === '') return true;
    return false;
  };

  const hasConditionalBranches = (step: FormStep) =>
    Array.isArray(step.nextStep) && step.nextStep.length > 0;

  const getConditionalTargets = (step: FormStep): string[] => {
    if (!Array.isArray(step.nextStep)) return [];
    return step.nextStep.map((n) => n.target).filter(Boolean);
  };

  if (steps.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
        No steps yet
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent -mx-1 overflow-x-auto overflow-y-hidden pb-2"
    >
      <div className="flex min-w-max items-center gap-0 px-2 py-3">
        {steps.map((step, idx) => {
          const isStart = step.id === startStepId;
          const isSelected = step.id === selectedStepId;
          const isEnd = isTerminal(step);
          const conditionalTargets = getConditionalTargets(step);
          const hasBranches = hasConditionalBranches(step);

          return (
            <React.Fragment key={step.id}>
              {/* Arrow from previous */}
              {idx > 0 && (
                <div className="flex shrink-0 items-center text-gray-300">
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </div>
              )}

              {/* Step node */}
              <div className="flex shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelectStep(step.id)}
                  className={`group relative flex min-w-[72px] cursor-pointer select-none flex-col items-center rounded-lg border-2 px-2.5 py-2 transition-all duration-150 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm'
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                  } `}
                >
                  {isStart && (
                    <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full">
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        <Play className="h-2.5 w-2.5" />
                        Start
                      </span>
                    </span>
                  )}
                  {isEnd && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 translate-y-full">
                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        <Flag className="h-2.5 w-2.5" />
                        End
                      </span>
                    </span>
                  )}
                  {hasBranches && (
                    <span className="absolute -top-1 right-0 -translate-y-1/2">
                      <Diamond
                        className="h-3 w-3 text-indigo-500"
                        fill="currentColor"
                        strokeWidth={0}
                      />
                    </span>
                  )}
                  <span className="text-[10px] font-medium text-gray-500">{idx + 1}</span>
                  <span className="max-w-[64px] break-words text-center text-xs font-medium leading-tight">
                    {getStepTitle(step)}
                  </span>
                </button>

                {/* Conditional branch indicators (optional) */}
                {hasBranches && conditionalTargets.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {conditionalTargets.slice(0, 3).map((targetId) => {
                      const targetIdx = stepIndex.get(targetId);
                      if (targetIdx == null) return null;
                      return (
                        <span key={targetId} className="text-[9px] font-medium text-indigo-500">
                          →{targetIdx + 1}
                        </span>
                      );
                    })}
                    {conditionalTargets.length > 3 && (
                      <span className="text-[9px] text-gray-400">
                        +{conditionalTargets.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
