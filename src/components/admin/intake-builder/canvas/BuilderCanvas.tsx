'use client';

import React, { useState, useCallback } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { FormStep, FormBranding, FormField, FieldType } from '../state/builderTypes';
import CanvasField from './CanvasField';
import CanvasDropZone from './CanvasDropZone';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BuilderCanvasProps {
  step: FormStep | undefined;
  devicePreview: 'mobile' | 'tablet' | 'desktop';
  language: 'en' | 'es';
  selectedFieldId: string | null;
  branding?: FormBranding;
  onSelectField: (fieldId: string) => void;
  onSelectStep: () => void;
  onUpdateStep: (updates: Partial<FormStep>) => void;
  onReorderFields: (activeId: string, overId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onDuplicateField: (fieldId: string) => void;
  onDropNewField: (fieldType: FieldType, atIndex?: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CANVAS_WIDTH: Record<'mobile' | 'tablet' | 'desktop', string> = {
  mobile: '375px',
  tablet: '768px',
  desktop: '100%',
};

function getLocalized(obj: { en?: string; es?: string } | undefined, lang: 'en' | 'es'): string {
  if (!obj) return '';
  return obj[lang] ?? obj.en ?? '';
}

// ---------------------------------------------------------------------------
// Inline editable text
// ---------------------------------------------------------------------------

interface InlineEditableProps {
  value: string;
  placeholder?: string;
  className?: string;
  onSave: (value: string) => void;
}

function InlineEditable({ value, placeholder, className = '', onSave }: InlineEditableProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) {
      onSave(trimmed);
    }
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === 'Escape') {
        setDraft(value);
        (e.target as HTMLInputElement).blur();
      }
    },
    [value]
  );

  if (isEditing) {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        placeholder={placeholder}
        className={`min-w-0 flex-1 bg-transparent outline-none focus:ring-0 ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value || '');
        setIsEditing(true);
      }}
      className={`min-w-0 flex-1 text-left hover:bg-gray-100/50 rounded px-1 -mx-1 dark:hover:bg-gray-800/50 ${className}`}
    >
      {value || placeholder || 'Click to edit'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BuilderCanvas({
  step,
  devicePreview,
  language,
  selectedFieldId,
  onSelectField,
  onSelectStep,
  onUpdateStep,
  onReorderFields,
  onDeleteField,
  onDuplicateField,
  onDropNewField,
}: BuilderCanvasProps) {
  const fieldIds = step?.fields?.map((f) => f.id) ?? [];
  const canvasWidth = CANVAS_WIDTH[devicePreview];

  // No step selected
  if (!step) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Select a step from the sidebar to start editing
          </p>
        </div>
      </div>
    );
  }

  const title = getLocalized(step.title, language);
  const subtitle = getLocalized(step.subtitle, language);
  const hasFields = (step.fields?.length ?? 0) > 0;

  const handleTitleSave = useCallback(
    (text: string) => {
      onUpdateStep({ title: { ...step.title, [language]: text } });
    },
    [step?.title, language, onUpdateStep]
  );

  const handleSubtitleSave = useCallback(
    (text: string) => {
      onUpdateStep({ subtitle: { ...step.subtitle, [language]: text } });
    },
    [step?.subtitle, language, onUpdateStep]
  );

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-gray-100 p-6 dark:bg-gray-900">
      <div
        className="flex min-h-0 w-full flex-col rounded-xl bg-white shadow-lg dark:bg-gray-800"
        style={{ maxWidth: canvasWidth }}
      >
        {/* Progress bar */}
        <div className="h-1 flex-shrink-0 overflow-hidden rounded-t-xl bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full bg-indigo-500 transition-all duration-300 dark:bg-indigo-400"
            style={{ width: `${Math.min(100, Math.max(0, step.progressPercent ?? 0))}%` }}
          />
        </div>

        {/* Step header */}
        <div
          className="flex flex-col gap-1 border-b border-gray-100 px-6 py-4 dark:border-gray-700"
          onClick={onSelectStep}
        >
          <InlineEditable
            value={title}
            placeholder="Step title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            onSave={handleTitleSave}
          />
          <InlineEditable
            value={subtitle}
            placeholder="Step subtitle (optional)"
            className="text-sm text-gray-500 dark:text-gray-400"
            onSave={handleSubtitleSave}
          />
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-6" onClick={onSelectStep}>
          <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-4">
              {hasFields ? (
                step.fields!.map((field) => (
                  <CanvasField
                    key={field.id}
                    field={field}
                    language={language}
                    isSelected={selectedFieldId === field.id}
                    onSelect={() => onSelectField(field.id)}
                    onDelete={() => onDeleteField(field.id)}
                    onDuplicate={() => onDuplicateField(field.id)}
                  />
                ))
              ) : (
                <div
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-700">
                    <Plus className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Add your first field
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Drag a field from the palette or use the drop zone below
                  </p>
                </div>
              )}

              {/* Drop zone */}
              <CanvasDropZone id={`canvas-drop-${step.id}`} />
            </div>
          </SortableContext>
        </div>
      </div>
    </div>
  );
}
