'use client';

import React, { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Copy, Trash2, Plus, ChevronDown, Flag } from 'lucide-react';
import type { FormStep, StepType } from '../state/builderTypes';

// ---------------------------------------------------------------------------
// Step type config
// ---------------------------------------------------------------------------

const STEP_TYPES: { value: StepType; label: string }[] = [
  { value: 'single-select', label: 'Single choice' },
  { value: 'multi-select', label: 'Multiple choice' },
  { value: 'input', label: 'Input fields' },
  { value: 'info', label: 'Info / content' },
];

const STEP_TYPE_BADGE_CLASSES: Record<StepType, string> = {
  'single-select': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'multi-select': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  input: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  info: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  custom: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepListPanelProps {
  steps: FormStep[];
  startStepId: string;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onAddStep: (stepType: StepType) => void;
  onDuplicateStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onReorderSteps: (activeId: string, overId: string) => void;
  onSetStartStep: (stepId: string) => void;
  language: 'en' | 'es';
}

// ---------------------------------------------------------------------------
// Step card (sortable)
// ---------------------------------------------------------------------------

interface SortableStepCardProps {
  step: FormStep;
  isSelected: boolean;
  isStartStep: boolean;
  language: 'en' | 'es';
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetStartStep: () => void;
}

function SortableStepCard({
  step,
  isSelected,
  isStartStep,
  language,
  onSelect,
  onDuplicate,
  onDelete,
  onSetStartStep,
}: SortableStepCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const title = step.title[language] || step.title.en || 'Untitled';
  const fieldCount = step.fields?.length ?? 0;
  const badgeClass = STEP_TYPE_BADGE_CLASSES[step.type] ?? STEP_TYPE_BADGE_CLASSES.custom;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-start gap-2 rounded-lg border px-3 py-2.5 transition-all duration-150 ${isDragging ? 'z-50 opacity-90 shadow-lg' : ''} ${
        isSelected
          ? 'border-indigo-300 bg-indigo-50/80 dark:border-indigo-600 dark:bg-indigo-950/50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/80 dark:hover:border-gray-600 dark:hover:bg-gray-800'
      } `}
    >
      {/* Left accent for selected */}
      {isSelected && (
        <div className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r-full bg-indigo-500" />
      )}

      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-0.5 shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-300"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          {isStartStep && <Flag className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />}
          <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {title || 'Untitled'}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}
          >
            {step.type}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
          </span>
        </div>
      </button>

      {/* Hover actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSetStartStep();
          }}
          title={isStartStep ? 'Start step' : 'Set as start step'}
          className={`rounded p-1.5 transition-colors ${
            isStartStep
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-gray-400 hover:bg-gray-200 hover:text-amber-600 dark:hover:bg-gray-600 dark:hover:text-amber-400'
          }`}
        >
          <Flag className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="Duplicate step"
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-indigo-600 dark:hover:bg-gray-600 dark:hover:text-indigo-400"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete step"
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-gray-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StepListPanel({
  steps,
  startStepId,
  selectedStepId,
  onSelectStep,
  onAddStep,
  onDuplicateStep,
  onDeleteStep,
  onReorderSteps,
  onSetStartStep,
  language,
}: StepListPanelProps) {
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        onReorderSteps(String(active.id), String(over.id));
      }
    },
    [onReorderSteps]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const stepIds = steps.map((s) => s.id);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Form steps
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-12 dark:border-gray-700">
            <div className="rounded-full bg-gray-100 p-3 dark:bg-gray-800">
              <Flag className="h-6 w-6 text-gray-400" />
            </div>
            <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
              No steps yet
            </p>
            <p className="mt-1 text-center text-xs text-gray-400 dark:text-gray-500">
              Add a step to get started
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {steps.map((step) => (
                  <SortableStepCard
                    key={step.id}
                    step={step}
                    isSelected={selectedStepId === step.id}
                    isStartStep={startStepId === step.id}
                    language={language}
                    onSelect={() => onSelectStep(step.id)}
                    onDuplicate={() => onDuplicateStep(step.id)}
                    onDelete={() => onDeleteStep(step.id)}
                    onSetStartStep={() => onSetStartStep(step.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add Step button with dropdown */}
      <div className="border-t border-gray-200 p-2 dark:border-gray-700">
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddDropdownOpen((o) => !o)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300"
          >
            <Plus className="h-4 w-4" />
            Add Step
            <ChevronDown
              className={`h-4 w-4 transition-transform ${addDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {addDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden
                onClick={() => setAddDropdownOpen(false)}
              />
              <div className="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                {STEP_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      onAddStep(value);
                      setAddDropdownOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
