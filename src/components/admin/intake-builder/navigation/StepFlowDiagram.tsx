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

  const getStepTitle = (step: FormStep) =>
    truncate(step.title?.en || step.id, TRUNCATE_LEN);

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
      <div className="flex items-center justify-center h-16 text-sm text-gray-400 rounded-lg border border-dashed border-gray-200">
        No steps yet
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto overflow-y-hidden pb-2 -mx-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
    >
      <div className="flex items-center gap-0 min-w-max py-3 px-2">
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
                <div className="flex items-center shrink-0 text-gray-300">
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </div>
              )}

              {/* Step node */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectStep(step.id)}
                  className={`
                    group relative flex flex-col items-center min-w-[72px] px-2.5 py-2 rounded-lg
                    border-2 transition-all duration-150
                    select-none cursor-pointer
                    ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 text-gray-700'
                    }
                  `}
                >
                  {isStart && (
                    <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                        <Play className="w-2.5 h-2.5" />
                        Start
                      </span>
                    </span>
                  )}
                  {isEnd && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 translate-y-full">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                        <Flag className="w-2.5 h-2.5" />
                        End
                      </span>
                    </span>
                  )}
                  {hasBranches && (
                    <span className="absolute -top-1 right-0 -translate-y-1/2">
                      <Diamond
                        className="w-3 h-3 text-indigo-500"
                        fill="currentColor"
                        strokeWidth={0}
                      />
                    </span>
                  )}
                  <span className="text-[10px] font-medium text-gray-500">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-medium leading-tight text-center break-words max-w-[64px]">
                    {getStepTitle(step)}
                  </span>
                </button>

                {/* Conditional branch indicators (optional) */}
                {hasBranches && conditionalTargets.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                    {conditionalTargets.slice(0, 3).map((targetId) => {
                      const targetIdx = stepIndex.get(targetId);
                      if (targetIdx == null) return null;
                      return (
                        <span
                          key={targetId}
                          className="text-[9px] text-indigo-500 font-medium"
                        >
                          →{targetIdx + 1}
                        </span>
                      );
                    })}
                    {conditionalTargets.length > 3 && (
                      <span className="text-[9px] text-gray-400">+{conditionalTargets.length - 3}</span>
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
