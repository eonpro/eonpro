'use client';

import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Type,
  AlignLeft,
  Mail,
  Phone,
  Hash,
  Calendar,
  CircleDot,
  CheckSquare,
  ChevronDown,
  Heading,
  FileText,
  Minus,
  PenTool,
  Upload,
  EyeOff,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ELEMENT_CATEGORIES } from '../state/elementDefinitions';
import type { ElementDefinition } from '../state/builderTypes';
import type { FieldType } from '../state/builderTypes';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Type,
  AlignLeft,
  Mail,
  Phone,
  Hash,
  Calendar,
  CircleDot,
  CheckSquare,
  ChevronDown,
  Heading,
  FileText,
  Minus,
  PenTool,
  Upload,
  EyeOff,
  ShieldCheck,
};

function getIcon(iconName: string): LucideIcon {
  const Icon = ICON_MAP[iconName];
  return (Icon ?? Type) as LucideIcon;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ElementPaletteProps {
  onAddField: (stepId: string, fieldType: FieldType, elementId: string) => void;
  selectedStepId: string | null;
}

// ---------------------------------------------------------------------------
// Draggable element card
// ---------------------------------------------------------------------------

interface DraggableElementCardProps {
  element: ElementDefinition;
  selectedStepId: string | null;
}

function DraggableElementCard({ element, selectedStepId }: DraggableElementCardProps) {
  const canDrag = !!selectedStepId;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: element.id,
    data: {
      type: 'palette-element',
      elementId: element.id,
      fieldType: element.fieldType,
    },
    disabled: !canDrag,
  });

  const Icon = getIcon(element.icon);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={`
        flex cursor-grab flex-col gap-1 rounded-lg border px-2.5 py-2
        transition-all duration-150 active:cursor-grabbing
        ${isDragging ? 'z-50 opacity-60 shadow-lg' : ''}
        ${canDrag
          ? 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-900/50 dark:hover:bg-indigo-950/30'
          : 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900/50 dark:opacity-70'}
      `}
      title={!canDrag ? 'Select a step first' : element.description}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
          {element.label}
        </span>
      </div>
      <p className="line-clamp-2 pl-9 text-[10px] text-gray-500 dark:text-gray-400">
        {element.description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  id: string;
  label: string;
  elements: ElementDefinition[];
  selectedStepId: string | null;
}

function CategorySection({
  id,
  label,
  elements,
  selectedStepId,
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setIsExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-2 py-2.5 text-left transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/50"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
          {label}
        </span>
        <ChevronRight
          className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
      </button>
      {isExpanded && (
        <div className="grid grid-cols-2 gap-0.5 px-2 pb-3">
          {elements.map((element) => (
            <DraggableElementCard
              key={element.id}
              element={element}
              selectedStepId={selectedStepId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
//
// Note: ElementPalette must be wrapped in a DndContext (from @dnd-kit/core)
// provided by the parent layout so that elements can be dragged onto the canvas.
//

export default function ElementPalette({
  onAddField,
  selectedStepId,
}: ElementPaletteProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Elements
        </h3>
        {!selectedStepId && (
          <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
            Select a step to add fields
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {ELEMENT_CATEGORIES.map((category) => (
          <CategorySection
            key={category.id}
            id={category.id}
            label={category.label}
            elements={category.elements}
            selectedStepId={selectedStepId}
          />
        ))}
      </div>
    </div>
  );
}
