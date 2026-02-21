'use client';

import React from 'react';

interface OptionButtonProps {
  label: string;
  description?: string;
  selected?: boolean;
  onClick: () => void;
  showCheckbox?: boolean;
  disabled?: boolean;
}

export default function OptionButton({
  label,
  description,
  selected = false,
  onClick,
  showCheckbox = false,
  disabled = false,
}: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-start gap-4 w-full text-left px-5 py-4
        border-2 rounded-2xl transition-all duration-200
        font-medium text-base text-[var(--intake-text,#1f2937)]
        ${
          selected
            ? 'border-[#4fa87f] bg-[var(--intake-accent,#f0feab)]'
            : 'border-[var(--intake-border,#e5e7eb)] bg-white hover:border-gray-400 hover:bg-gray-50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {showCheckbox && (
        <div
          className={`
            w-[1.375rem] h-[1.375rem] rounded flex items-center justify-center flex-shrink-0 mt-0.5
            border-2 transition-all duration-150
            ${selected ? 'bg-[#413d3d] border-[#413d3d]' : 'bg-white border-[var(--intake-border,#e5e7eb)]'}
          `}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="leading-tight block">{label}</span>
        {description && (
          <span className="text-[0.9375rem] text-[var(--intake-text-secondary,#6b7280)] mt-1 block">{description}</span>
        )}
      </div>
    </button>
  );
}
