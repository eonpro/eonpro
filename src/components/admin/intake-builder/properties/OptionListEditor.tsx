'use client';

import React from 'react';
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import LocalizedInput from '../shared/LocalizedInput';
import type { FieldOption } from '../state/builderTypes';

interface OptionListEditorProps {
  options: FieldOption[];
  stepId: string;
  fieldId: string;
  onAddOption: (stepId: string, fieldId: string) => void;
  onDeleteOption: (stepId: string, fieldId: string, optionId: string) => void;
  onUpdateOption: (
    stepId: string,
    fieldId: string,
    optionId: string,
    updates: Partial<FieldOption>
  ) => void;
  onReorderOptions: (
    stepId: string,
    fieldId: string,
    activeId: string,
    overId: string
  ) => void;
}

function OptionRow({
  option,
  stepId,
  fieldId,
  onUpdate,
  onDelete,
}: {
  option: FieldOption;
  stepId: string;
  fieldId: string;
  onUpdate: (optionId: string, updates: Partial<FieldOption>) => void;
  onDelete: (optionId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded-lg border bg-white transition-colors ${
        isDragging ? 'border-indigo-300 shadow-md z-10' : 'border-gray-200'
      }`}
    >
      <button
        type="button"
        className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
        <LocalizedInput
          value={option.label}
          onChange={(v) => onUpdate(option.id, { label: v })}
          placeholder="Label"
          className="text-sm"
        />
        <input
          type="text"
          value={option.value}
          onChange={(e) => onUpdate(option.id, { value: e.target.value })}
          placeholder="Value"
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        />
      </div>
      <button
        type="button"
        onClick={() => onDelete(option.id)}
        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
        aria-label="Delete option"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function OptionListEditor({
  options,
  stepId,
  fieldId,
  onAddOption,
  onDeleteOption,
  onUpdateOption,
  onReorderOptions,
}: OptionListEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderOptions(stepId, fieldId, String(active.id), String(over.id));
    }
  };

  const handleUpdate = (optionId: string, updates: Partial<FieldOption>) => {
    onUpdateOption(stepId, fieldId, optionId, updates);
  };

  const handleDelete = (optionId: string) => {
    onDeleteOption(stepId, fieldId, optionId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">
          Options
        </span>
        <button
          type="button"
          onClick={() => onAddOption(stepId, fieldId)}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          + Add Option
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={options.map((o) => o.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {options.map((option) => (
              <OptionRow
                key={option.id}
                option={option}
                stepId={stepId}
                fieldId={fieldId}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {options.length === 0 && (
        <p className="text-xs text-gray-500 py-2">
          No options yet. Add options for radio, checkbox, or select fields.
        </p>
      )}
    </div>
  );
}
