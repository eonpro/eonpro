'use client';

import React from 'react';

interface CheckboxFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  disabled?: boolean;
  description?: React.ReactNode;
}

export default function CheckboxField({
  id,
  label,
  checked,
  onChange,
  error,
  disabled = false,
  description,
}: CheckboxFieldProps) {
  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className={`
          flex items-start cursor-pointer
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <div
          className={`
            mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0
            border-[1.5px] border-[var(--intake-primary,#413d3d)] transition-all
            ${checked ? 'bg-[var(--intake-accent,#f0feab)]' : 'bg-transparent'}
          `}
          onClick={() => !disabled && onChange(!checked)}
          role="presentation"
        >
          {checked && (
            <svg
              className="w-3 h-3 text-[var(--intake-primary,#413d3d)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
        <div className="ml-3 flex-1">
          <span className="text-sm leading-tight">{label}</span>
          {description && (
            <div className="mt-1 text-xs text-gray-500">{description}</div>
          )}
        </div>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </label>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
