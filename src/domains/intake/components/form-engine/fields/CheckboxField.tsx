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
  const toggle = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className={`flex min-h-[44px] cursor-pointer items-start gap-4 py-2 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        onClick={(e) => {
          e.preventDefault();
          toggle();
        }}
      >
        <div
          className={`mt-0.5 flex h-7 w-7 min-w-[1.75rem] flex-shrink-0 items-center justify-center rounded-lg transition-all duration-150 ${checked ? 'border-[#413d3d] bg-[#413d3d]' : 'border-[#d1d5db] bg-white'} `}
          style={{ borderWidth: '2px', borderStyle: 'solid' }}
        >
          {checked && (
            <svg
              className="h-4 w-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 pt-0.5">
          <span className="text-[14px] leading-snug text-[#413d3d]">{label}</span>
          {description && <div className="mt-1 text-xs text-gray-500">{description}</div>}
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
