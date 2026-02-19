'use client';

import React, { InputHTMLAttributes, forwardRef, useId } from 'react';

interface AccessibleInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label text */
  label: string;
  /** Helper text below input */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Hide label visually (still accessible to screen readers) */
  hideLabel?: boolean;
  /** Left icon */
  leftIcon?: React.ReactNode;
  /** Right icon */
  rightIcon?: React.ReactNode;
}

const AccessibleInput = forwardRef<HTMLInputElement, AccessibleInputProps>(
  (
    {
      label,
      helperText,
      error,
      hideLabel = false,
      leftIcon,
      rightIcon,
      className = '',
      id: providedId,
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    // Generate unique IDs for accessibility
    const generatedId = useId();
    const inputId = providedId || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    // Determine aria-describedby
    const describedBy =
      [helperText ? helperId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        {/* Label */}
        <label
          htmlFor={inputId}
          className={`mb-1 block text-sm font-medium text-gray-700 ${hideLabel ? 'sr-only' : ''}`}
        >
          {label}
          {required && (
            <span className="ml-1 text-red-500" aria-hidden="true">
              *
            </span>
          )}
        </label>

        {/* Input wrapper */}
        <div className="relative">
          {/* Left icon */}
          {leftIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
              {leftIcon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            className={`block w-full rounded-lg border text-[16px] leading-normal transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:cursor-not-allowed disabled:bg-gray-100 ${leftIcon ? 'pl-12' : 'pl-4'} ${rightIcon ? 'pr-10' : 'pr-4'} py-2.5 ${
              error
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-[#4fa77e] focus:ring-[#4fa77e]'
            } ${className} `}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={describedBy}
            aria-required={required}
            disabled={disabled}
            {...props}
          />

          {/* Right icon */}
          {rightIcon && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
              {rightIcon}
            </div>
          )}
        </div>

        {/* Helper text */}
        {helperText && !error && (
          <p id={helperId} className="mt-1 text-sm text-gray-500">
            {helperText}
          </p>
        )}

        {/* Error message */}
        {error && (
          <p id={errorId} className="mt-1 text-sm text-red-600" role="alert" aria-live="polite">
            {error}
          </p>
        )}
      </div>
    );
  }
);

AccessibleInput.displayName = 'AccessibleInput';

export default AccessibleInput;
