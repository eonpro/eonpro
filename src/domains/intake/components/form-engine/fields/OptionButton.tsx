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
      className={`option-button ${selected ? 'selected' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {showCheckbox && (
        <div
          className="rounded-[5px] flex items-center justify-center flex-shrink-0 aspect-square transition-all duration-150"
          style={{
            width: 20, height: 20, minWidth: 20, maxWidth: 20, minHeight: 20, maxHeight: 20,
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: selected ? 'var(--intake-accent, #413d3d)' : '#d1d5db',
            backgroundColor: selected ? 'var(--intake-accent, #413d3d)' : '#ffffff',
          }}
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
          <span className="text-[0.875rem] opacity-60 mt-1 block">{description}</span>
        )}
      </div>
    </button>
  );
}
