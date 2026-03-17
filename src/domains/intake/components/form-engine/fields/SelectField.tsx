'use client';

import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  error?: string;
  disabled?: boolean;
}

export default function SelectField({
  id,
  label,
  placeholder = 'Select an option',
  value,
  onChange,
  options,
  error,
  disabled = false,
}: SelectFieldProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm text-gray-600 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`select-field w-full ${error ? 'border-red-500 focus:border-red-500' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
