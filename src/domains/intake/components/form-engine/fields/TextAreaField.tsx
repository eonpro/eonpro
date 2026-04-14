'use client';

import React from 'react';

interface TextAreaFieldProps {
  id: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  showLabel?: boolean;
}

export default function TextAreaField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
  rows = 4,
  maxLength,
  showLabel = false,
}: TextAreaFieldProps) {
  return (
    <div className="w-full">
      {showLabel && label && (
        <label htmlFor={id} className="mb-2 block text-sm text-gray-600">
          {label}
        </label>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder || label}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`focus:ring-[var(--intake-primary,#10b981)]/10 w-full resize-y rounded-[7px] border px-5 py-4 text-base font-semibold outline-none transition-all placeholder:font-normal placeholder:opacity-50 focus:border-[var(--intake-primary,#10b981)] focus:ring-4 ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10' : 'border-[var(--intake-border,#e5e7eb)]'} ${disabled ? 'cursor-not-allowed bg-gray-50 opacity-50' : 'bg-white'} `}
      />
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm font-medium text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
