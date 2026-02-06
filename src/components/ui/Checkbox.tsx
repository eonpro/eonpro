'use client';

import React, { forwardRef, useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// CHECKBOX - Clear visual checkbox with prominent checkmark
// =============================================================================

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text displayed next to the checkbox */
  label?: string;
  /** Optional description text below the label */
  description?: string;
  /** Error message to display */
  error?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant - uses clinic primary color by default */
  color?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { 
      label, 
      description, 
      error, 
      className,
      size = 'md',
      color = '#4fa77e',
      checked,
      disabled,
      ...props 
    },
    ref
  ) {
    const id = useId();
    const descriptionId = `${id}-description`;
    const errorId = `${id}-error`;

    const sizeClasses = {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
    };

    const iconSizes = {
      sm: 'h-3 w-3',
      md: 'h-3.5 w-3.5',
      lg: 'h-4 w-4',
    };

    return (
      <div className="space-y-1">
        <label 
          htmlFor={id}
          className={cn(
            'inline-flex items-start gap-3 cursor-pointer select-none',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          {/* Custom checkbox visual */}
          <div className="relative flex items-center justify-center flex-shrink-0 mt-0.5">
            <input
              ref={ref}
              id={id}
              type="checkbox"
              checked={checked}
              disabled={disabled}
              aria-describedby={cn(
                description && descriptionId,
                error && errorId
              ) || undefined}
              aria-invalid={error ? 'true' : undefined}
              className="sr-only peer"
              {...props}
            />
            {/* Checkbox box */}
            <div
              className={cn(
                sizeClasses[size],
                'rounded border-2 transition-all duration-200',
                'flex items-center justify-center',
                checked
                  ? 'border-transparent'
                  : 'border-gray-300 bg-white hover:border-gray-400',
                disabled && 'opacity-50',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
                className
              )}
              style={{
                backgroundColor: checked ? color : undefined,
                ['--tw-ring-color' as string]: color,
              }}
            >
              {/* Checkmark icon - always visible when checked */}
              <Check 
                className={cn(
                  iconSizes[size],
                  'text-white transition-all duration-200',
                  checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                )}
                strokeWidth={3}
              />
            </div>
          </div>

          {/* Label and description */}
          {(label || description) && (
            <div className="flex-1 min-w-0">
              {label && (
                <span className="text-sm font-medium text-gray-700 block">
                  {label}
                </span>
              )}
              {description && (
                <span 
                  id={descriptionId} 
                  className="text-sm text-gray-500 block mt-0.5"
                >
                  {description}
                </span>
              )}
            </div>
          )}
        </label>

        {/* Error message */}
        {error && (
          <p
            id={errorId}
            className="text-sm text-red-600 ml-8"
            role="alert"
            aria-live="polite"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

// =============================================================================
// TOGGLE / SWITCH - Clear on/off toggle switch
// =============================================================================

export interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Label text displayed next to the toggle */
  label?: string;
  /** Optional description text below the label */
  description?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Color when active - uses clinic primary color by default */
  color?: string;
  /** Show ON/OFF text inside the toggle */
  showStatus?: boolean;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  function Toggle(
    { 
      label, 
      description,
      size = 'md',
      color = '#4fa77e',
      showStatus = false,
      checked,
      disabled,
      className,
      ...props 
    },
    ref
  ) {
    const id = useId();

    const sizes = {
      sm: { track: 'w-8 h-4', thumb: 'h-3 w-3', translate: 'translate-x-4' },
      md: { track: 'w-11 h-6', thumb: 'h-5 w-5', translate: 'translate-x-5' },
      lg: { track: 'w-14 h-7', thumb: 'h-6 w-6', translate: 'translate-x-7' },
    };

    const { track, thumb, translate } = sizes[size];

    return (
      <label 
        htmlFor={id}
        className={cn(
          'inline-flex items-center gap-3 cursor-pointer select-none',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        {/* Toggle switch */}
        <div className="relative flex-shrink-0">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            className="sr-only peer"
            {...props}
          />
          {/* Track */}
          <div
            className={cn(
              track,
              'rounded-full transition-all duration-200',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
              checked ? '' : 'bg-gray-300'
            )}
            style={{
              backgroundColor: checked ? color : undefined,
              ['--tw-ring-color' as string]: color,
            }}
          >
            {/* Status text inside toggle */}
            {showStatus && size !== 'sm' && (
              <span className={cn(
                'absolute inset-0 flex items-center text-[9px] font-bold text-white uppercase',
                checked ? 'justify-start pl-1.5' : 'justify-end pr-1.5'
              )}>
                {checked ? 'ON' : 'OFF'}
              </span>
            )}
          </div>
          {/* Thumb */}
          <div
            className={cn(
              thumb,
              'absolute top-0.5 left-0.5 rounded-full bg-white shadow-md',
              'transition-transform duration-200 ease-in-out',
              checked && translate
            )}
          />
        </div>

        {/* Label and description */}
        {(label || description) && (
          <div className="flex-1 min-w-0">
            {label && (
              <span className="text-sm font-medium text-gray-700 block">
                {label}
              </span>
            )}
            {description && (
              <span className="text-sm text-gray-500 block mt-0.5">
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

// =============================================================================
// CHECKBOX GROUP - For grouping multiple checkboxes
// =============================================================================

export interface CheckboxOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface CheckboxGroupProps {
  /** Group label */
  label?: string;
  /** Available options */
  options: CheckboxOption[];
  /** Currently selected values */
  value: string[];
  /** Callback when selection changes */
  onChange: (value: string[]) => void;
  /** Layout direction */
  direction?: 'horizontal' | 'vertical';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant */
  color?: string;
  /** Optional error message */
  error?: string;
  /** Optional helper text */
  helperText?: string;
}

export function CheckboxGroup({
  label,
  options,
  value,
  onChange,
  direction = 'horizontal',
  size = 'md',
  color = '#4fa77e',
  error,
  helperText,
}: CheckboxGroupProps) {
  const handleChange = (optionId: string, checked: boolean) => {
    if (checked) {
      onChange([...value, optionId]);
    } else {
      onChange(value.filter(v => v !== optionId));
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className={cn(
        'flex gap-4',
        direction === 'vertical' ? 'flex-col' : 'flex-wrap'
      )}>
        {options.map((option) => (
          <Checkbox
            key={option.id}
            label={option.label}
            description={option.description}
            checked={value.includes(option.id)}
            onChange={(e) => handleChange(option.id, e.target.checked)}
            disabled={option.disabled}
            size={size}
            color={color}
          />
        ))}
      </div>
      {helperText && !error && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}
      {error && (
        <p className="text-xs text-red-600" role="alert">{error}</p>
      )}
    </div>
  );
}

export default Checkbox;
