'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Copy,
  Trash2,
  Type,
  Mail,
  Phone,
  Hash,
  Calendar,
  AlignLeft,
  ChevronDown,
  PenTool,
  CloudUpload,
  EyeOff,
} from 'lucide-react';
import type { FormField } from '../state/builderTypes';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CanvasFieldProps {
  field: FormField;
  language: 'en' | 'es';
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLocalized(
  field: FormField,
  key: 'label' | 'placeholder' | 'description',
  lang: 'en' | 'es'
): string {
  const val = field[key];
  if (!val) return '';
  return val[lang] ?? val.en ?? '';
}

function getOptionLabel(opt: { label: { en?: string; es?: string } }, lang: 'en' | 'es'): string {
  return opt.label[lang] ?? opt.label.en ?? '';
}

// ---------------------------------------------------------------------------
// Field preview renderers
// ---------------------------------------------------------------------------

function FieldPreviewText({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const placeholder = getLocalized(field, 'placeholder', language) || 'Enter text...';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800">
      <Type className="h-4 w-4 shrink-0 text-gray-400" />
      <input
        type="text"
        readOnly
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-400 placeholder:text-gray-500 dark:text-gray-500 dark:placeholder:text-gray-400"
      />
    </div>
  );
}

function FieldPreviewEmail({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const placeholder = getLocalized(field, 'placeholder', language) || 'your@email.com';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800">
      <Mail className="h-4 w-4 shrink-0 text-gray-400" />
      <input
        type="text"
        readOnly
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-400 placeholder:text-gray-500 dark:text-gray-500 dark:placeholder:text-gray-400"
      />
    </div>
  );
}

function FieldPreviewPhone({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const placeholder = getLocalized(field, 'placeholder', language) || '(555) 555-5555';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800">
      <Phone className="h-4 w-4 shrink-0 text-gray-400" />
      <input
        type="text"
        readOnly
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-400 placeholder:text-gray-500 dark:text-gray-500 dark:placeholder:text-gray-400"
      />
    </div>
  );
}

function FieldPreviewNumber({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const placeholder = getLocalized(field, 'placeholder', language) || '0';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800">
      <Hash className="h-4 w-4 shrink-0 text-gray-400" />
      <input
        type="text"
        readOnly
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-400 placeholder:text-gray-500 dark:text-gray-500 dark:placeholder:text-gray-400"
      />
    </div>
  );
}

function FieldPreviewTextarea({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const placeholder = getLocalized(field, 'placeholder', language) || 'Enter your response...';
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800">
      <textarea
        readOnly
        rows={3}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent text-sm text-gray-400 placeholder:text-gray-500 dark:text-gray-500 dark:placeholder:text-gray-400"
      />
    </div>
  );
}

function FieldPreviewDate({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const placeholder = getLocalized(field, 'placeholder', language) || 'MM/DD/YYYY';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800">
      <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
      <input
        type="text"
        readOnly
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-400 placeholder:text-gray-500 dark:text-gray-500 dark:placeholder:text-gray-400"
      />
    </div>
  );
}

function FieldPreviewRadio({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const options = field.options ?? [];
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <div
          key={opt.id}
          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800"
        >
          <div className="h-4 w-4 shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {getOptionLabel(opt, language)}
          </span>
        </div>
      ))}
    </div>
  );
}

function FieldPreviewCheckbox({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const options = field.options;
  const hasOptions = options && options.length > 0;

  if (hasOptions) {
    return (
      <div className="space-y-2">
        {options!.map((opt) => (
          <div
            key={opt.id}
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800"
          >
            <div className="h-4 w-4 shrink-0 rounded border border-gray-300 dark:border-gray-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {getOptionLabel(opt, language)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  const label = getLocalized(field, 'label', language);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800">
      <div className="h-4 w-4 shrink-0 rounded border border-gray-300 dark:border-gray-500" />
      <span className="text-sm text-gray-600 dark:text-gray-400">{label || 'I agree...'}</span>
    </div>
  );
}

function FieldPreviewSelect({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const placeholder = getLocalized(field, 'placeholder', language) || 'Choose...';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800">
      <span className="min-w-0 flex-1 text-sm text-gray-400">{placeholder}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
    </div>
  );
}

function FieldPreviewSignature({ language }: { language: 'en' | 'es' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/50 py-8 dark:border-gray-600 dark:bg-gray-800/50">
      <PenTool className="h-6 w-6 text-gray-400" />
      <span className="text-sm text-gray-500 dark:text-gray-400">Sign here</span>
    </div>
  );
}

function FieldPreviewFile({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/50 py-8 dark:border-gray-600 dark:bg-gray-800/50">
      <CloudUpload className="h-6 w-6 text-gray-400" />
      <span className="text-sm text-gray-500 dark:text-gray-400">Drop files here</span>
    </div>
  );
}

function FieldPreviewHidden({ field }: { field: FormField }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/30">
      <EyeOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
        {field.storageKey}
      </span>
    </div>
  );
}

function FieldPreviewHeading({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const text = getLocalized(field, 'label', language) || 'Heading';
  return <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{text}</h3>;
}

function FieldPreviewParagraph({ field, language }: { field: FormField; language: 'en' | 'es' }) {
  const text = getLocalized(field, 'label', language) || 'Add your text here...';
  return <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">{text}</p>;
}

function FieldPreviewDivider() {
  return <hr className="border-gray-200 dark:border-gray-700" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CanvasField({
  field,
  language,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
}: CanvasFieldProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const displayOnly = (field.props as { displayOnly?: boolean; variant?: string })?.displayOnly;
  const variant = (field.props as { displayOnly?: boolean; variant?: string })?.variant;

  const renderPreview = () => {
    if (displayOnly && variant === 'heading')
      return <FieldPreviewHeading field={field} language={language} />;
    if (displayOnly && variant === 'paragraph')
      return <FieldPreviewParagraph field={field} language={language} />;
    if (displayOnly && variant === 'divider') return <FieldPreviewDivider />;
    if (field.type === 'hidden' && !displayOnly) return <FieldPreviewHidden field={field} />;

    switch (field.type) {
      case 'text':
        return <FieldPreviewText field={field} language={language} />;
      case 'email':
        return <FieldPreviewEmail field={field} language={language} />;
      case 'phone':
        return <FieldPreviewPhone field={field} language={language} />;
      case 'number':
        return <FieldPreviewNumber field={field} language={language} />;
      case 'textarea':
        return <FieldPreviewTextarea field={field} language={language} />;
      case 'date':
        return <FieldPreviewDate field={field} language={language} />;
      case 'radio':
        return <FieldPreviewRadio field={field} language={language} />;
      case 'checkbox':
        return <FieldPreviewCheckbox field={field} language={language} />;
      case 'select':
        return <FieldPreviewSelect field={field} language={language} />;
      case 'signature':
        return <FieldPreviewSignature language={language} />;
      case 'file':
        return <FieldPreviewFile field={field} language={language} />;
      default:
        return <FieldPreviewText field={field} language={language} />;
    }
  };

  const showLabel = !displayOnly || (variant !== 'heading' && variant !== 'paragraph');

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`group relative rounded-lg border-2 transition-all duration-150 ${isDragging ? 'z-50 opacity-60 shadow-lg' : ''} ${
        isSelected
          ? 'border-indigo-500 ring-2 ring-indigo-400/30 dark:border-indigo-400 dark:ring-indigo-500/30'
          : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'
      } `}
    >
      {/* Drag handle - visible on hover */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 z-10 flex h-full w-6 cursor-grab items-center justify-center opacity-0 transition-opacity hover:bg-gray-100/80 active:cursor-grabbing group-hover:opacity-100 dark:hover:bg-gray-700/50"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>

      {/* Action buttons - visible on hover */}
      <div
        className="absolute right-1 top-1 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="Duplicate"
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
          title="Delete"
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-gray-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="pb-3 pl-6 pr-10 pt-3">
        {showLabel && (
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {getLocalized(field, 'label', language)}
          </label>
        )}
        {renderPreview()}
      </div>
    </div>
  );
}
