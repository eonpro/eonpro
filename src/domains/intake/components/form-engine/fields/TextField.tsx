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
        <label htmlFor={id} className="mb-2 block text-sm text-gray-600">
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
        className={`input-field w-full ${error ? 'border-red-500 focus:border-red-500' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm font-medium text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
