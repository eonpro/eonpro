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
          className={`
            w-full appearance-none px-5 py-4 rounded-full border-2 text-[16px]
            font-medium outline-none transition-all
            focus:border-[var(--intake-primary,#413d3d)] focus:ring-1 focus:ring-[var(--intake-primary,#413d3d)]
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-200'}
            ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'bg-white'}
          `}
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
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
