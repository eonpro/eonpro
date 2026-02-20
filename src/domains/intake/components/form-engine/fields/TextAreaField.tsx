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
        <label htmlFor={id} className="block text-sm text-gray-600 mb-2">
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
        className={`
          w-full px-5 py-4 rounded-2xl border-2 text-[16px]
          font-medium outline-none transition-all resize-y
          placeholder:text-gray-400 placeholder:font-normal
          focus:border-[var(--intake-primary,#413d3d)] focus:ring-1 focus:ring-[var(--intake-primary,#413d3d)]
          ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-200'}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'bg-white'}
        `}
      />
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm font-medium text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
