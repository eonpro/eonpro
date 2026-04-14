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
      className={`option-button ${selected ? 'selected' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {showCheckbox && (
        <div
          className="flex aspect-square flex-shrink-0 items-center justify-center rounded-[5px] transition-all duration-150"
          style={{
            width: 20,
            height: 20,
            minWidth: 20,
            maxWidth: 20,
            minHeight: 20,
            maxHeight: 20,
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: selected ? 'var(--intake-accent, #413d3d)' : '#d1d5db',
            backgroundColor: selected ? 'var(--intake-accent, #413d3d)' : '#ffffff',
          }}
        >
          {selected && (
            <svg
              className="h-3 w-3 text-white"
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
      <div className="min-w-0 flex-1">
        <span className="block leading-tight">{label}</span>
        {description && (
          <span className="mt-1 block text-[0.875rem] opacity-60">{description}</span>
        )}
      </div>
    </button>
  );
}
