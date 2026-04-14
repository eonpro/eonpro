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
  onReorderOptions: (stepId: string, fieldId: string, activeId: string, overId: string) => void;
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border bg-white p-2 transition-colors ${
        isDragging ? 'z-10 border-indigo-300 shadow-md' : 'border-gray-200'
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none p-1 text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
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
          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>
      <button
        type="button"
        onClick={() => onDelete(option.id)}
        className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
        aria-label="Delete option"
      >
        <Trash2 className="h-4 w-4" />
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
        <span className="text-xs font-medium uppercase tracking-wider text-gray-600">Options</span>
        <button
          type="button"
          onClick={() => onAddOption(stepId, fieldId)}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          + Add Option
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
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
        <p className="py-2 text-xs text-gray-500">
          No options yet. Add options for radio, checkbox, or select fields.
        </p>
      )}
    </div>
  );
}
