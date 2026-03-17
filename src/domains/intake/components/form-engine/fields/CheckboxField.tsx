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
  const toggle = () => { if (!disabled) onChange(!checked); };

  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className={`flex items-start gap-4 cursor-pointer min-h-[44px] py-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={(e) => { e.preventDefault(); toggle(); }}
      >
        <div
          className={`
            mt-0.5 w-7 h-7 min-w-[1.75rem] rounded-lg flex items-center justify-center flex-shrink-0
            transition-all duration-150
            ${checked ? 'bg-[#413d3d] border-[#413d3d]' : 'bg-white border-[#d1d5db]'}
          `}
          style={{ borderWidth: '2px', borderStyle: 'solid' }}
        >
          {checked && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="flex-1 pt-0.5">
          <span className="text-[14px] leading-snug text-[#413d3d]">{label}</span>
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
