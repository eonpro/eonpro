'use client';

import React from 'react';

interface TextFieldProps {
  id: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: 'text' | 'email' | 'tel' | 'number';
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  showLabel?: boolean;
}

export default function TextField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  type = 'text',
  error,
  disabled = false,
  autoFocus = false,
  maxLength,
  showLabel = false,
}: TextFieldProps) {
  return (
    <div className="w-full">
      {showLabel && label && (
        <label htmlFor={id} className="block text-sm text-gray-600 mb-2">
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder || label}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={maxLength}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`
          w-full px-5 py-4 rounded-[7px] border text-base
          font-semibold outline-none transition-all
          placeholder:font-normal placeholder:opacity-50
          focus:border-[var(--intake-primary,#10b981)] focus:ring-4 focus:ring-[var(--intake-primary,#10b981)]/10
          ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10' : 'border-[var(--intake-border,#e5e7eb)]'}
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
