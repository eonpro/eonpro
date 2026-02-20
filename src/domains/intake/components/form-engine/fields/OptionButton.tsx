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
        w-full text-left px-5 py-4 rounded-full border-2 transition-all
        font-medium text-[16px] lg:text-lg
        ${
          selected
            ? 'border-[var(--intake-primary,#413d3d)] bg-[var(--intake-accent,#f0feab)]'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className="flex items-start">
        {showCheckbox && (
          <div
            className={`
              w-5 h-5 rounded mr-3 mt-0.5 flex items-center justify-center flex-shrink-0
              border-[1.5px] border-[var(--intake-primary,#413d3d)] transition-all
              ${selected ? 'bg-white' : 'bg-transparent'}
            `}
          >
            {selected && (
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
        )}
        <div className="flex-1">
          <span className="leading-tight block">{label}</span>
          {description && (
            <span className="text-sm opacity-60 mt-1 block">{description}</span>
          )}
        </div>
      </div>
    </button>
  );
}
