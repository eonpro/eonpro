'use client';

import React, { forwardRef, useId, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

// =============================================================================
// ACCESSIBLE FORM - WCAG 2.1 AA Compliant Form Components
// =============================================================================

// Types
interface FormFieldProps {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactElement;
  className?: string;
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  helperText?: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  helperText?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
  error?: string;
}

interface RadioGroupProps {
  name: string;
  label: string;
  options: Array<{ value: string; label: string; description?: string; disabled?: boolean }>;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  orientation?: 'horizontal' | 'vertical';
  required?: boolean;
}

// =============================================================================
// FORM FIELD WRAPPER - Provides consistent structure for all form fields
// =============================================================================

export function FormField({
  label,
  error,
  helperText,
  required,
  children,
  className,
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  // Clone child with accessibility attributes
  const child = React.cloneElement(children, {
    id,
    'aria-describedby': cn(
      error && errorId,
      helperText && helperId
    ) || undefined,
    'aria-invalid': error ? 'true' : undefined,
    'aria-required': required ? 'true' : undefined,
  });

  return (
    <div className={cn('space-y-2', className)}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">*</span>
        )}
        {required && (
          <span className="sr-only">(required)</span>
        )}
      </label>
      {child}
      {helperText && !error && (
        <p id={helperId} className="text-sm text-gray-500">
          {helperText}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="text-sm text-red-600"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// TEXT INPUT - Accessible text input field
// =============================================================================

export const AccessibleTextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function AccessibleTextInput(
    { label, error, helperText, required, className, type = 'text', ...props },
    ref
  ) {
    const id = useId();
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    return (
      <div className="space-y-2">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
          {required && (
            <span className="text-red-500 ml-1" aria-hidden="true">*</span>
          )}
        </label>
        <input
          ref={ref}
          id={id}
          type={type}
          aria-describedby={cn(
            error && errorId,
            helperText && helperId
          ) || undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-required={required ? 'true' : undefined}
          className={cn(
            'block w-full rounded-lg border px-4 py-3 text-base',
            'focus:outline-none focus:ring-2 focus:ring-offset-2',
            'transition-colors duration-200',
            // Touch target: minimum 44x44px (WCAG 2.5.5)
            'min-h-[44px]',
            error
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
            'disabled:bg-gray-100 disabled:cursor-not-allowed',
            className
          )}
          {...props}
        />
        {helperText && !error && (
          <p id={helperId} className="text-sm text-gray-500">
            {helperText}
          </p>
        )}
        {error && (
          <p
            id={errorId}
            className="text-sm text-red-600"
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
// TEXTAREA - Accessible multi-line text input
// =============================================================================

export const AccessibleTextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function AccessibleTextArea(
    { label, error, helperText, required, className, rows = 4, ...props },
    ref
  ) {
    const id = useId();
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    return (
      <div className="space-y-2">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
          {required && (
            <span className="text-red-500 ml-1" aria-hidden="true">*</span>
          )}
        </label>
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          aria-describedby={cn(
            error && errorId,
            helperText && helperId
          ) || undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-required={required ? 'true' : undefined}
          className={cn(
            'block w-full rounded-lg border px-4 py-3 text-base',
            'focus:outline-none focus:ring-2 focus:ring-offset-2',
            'transition-colors duration-200 resize-y',
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:ring-blue-500',
            'disabled:bg-gray-100 disabled:cursor-not-allowed',
            className
          )}
          {...props}
        />
        {helperText && !error && (
          <p id={helperId} className="text-sm text-gray-500">
            {helperText}
          </p>
        )}
        {error && (
          <p
            id={errorId}
            className="text-sm text-red-600"
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
// SELECT - Accessible dropdown select
// =============================================================================

export const AccessibleSelect = forwardRef<HTMLSelectElement, SelectProps>(
  function AccessibleSelect(
    { label, error, helperText, required, options, placeholder, className, ...props },
    ref
  ) {
    const id = useId();
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    return (
      <div className="space-y-2">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
          {required && (
            <span className="text-red-500 ml-1" aria-hidden="true">*</span>
          )}
        </label>
        <select
          ref={ref}
          id={id}
          aria-describedby={cn(
            error && errorId,
            helperText && helperId
          ) || undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-required={required ? 'true' : undefined}
          className={cn(
            'block w-full rounded-lg border px-4 py-3 text-base',
            'focus:outline-none focus:ring-2 focus:ring-offset-2',
            'transition-colors duration-200',
            // Touch target: minimum 44x44px
            'min-h-[44px]',
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:ring-blue-500',
            'disabled:bg-gray-100 disabled:cursor-not-allowed',
            'appearance-none bg-white',
            // Custom arrow
            'bg-no-repeat bg-right pr-10',
            className
          )}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            backgroundPosition: 'right 0.75rem center',
            backgroundSize: '1.25em 1.25em',
          }}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        {helperText && !error && (
          <p id={helperId} className="text-sm text-gray-500">
            {helperText}
          </p>
        )}
        {error && (
          <p
            id={errorId}
            className="text-sm text-red-600"
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
// CHECKBOX - Accessible checkbox with label
// =============================================================================

export const AccessibleCheckbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function AccessibleCheckbox(
    { label, description, error, className, ...props },
    ref
  ) {
    const id = useId();
    const descriptionId = `${id}-description`;
    const errorId = `${id}-error`;

    return (
      <div className="space-y-1">
        <div className="flex items-start">
          <div className="flex items-center h-6">
            <input
              ref={ref}
              id={id}
              type="checkbox"
              aria-describedby={cn(
                description && descriptionId,
                error && errorId
              ) || undefined}
              aria-invalid={error ? 'true' : undefined}
              className={cn(
                'h-5 w-5 rounded border-gray-300',
                'text-blue-600 focus:ring-blue-500 focus:ring-2',
                'transition-colors duration-200',
                // Touch target: ensure wrapper is at least 44x44px
                'cursor-pointer',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className
              )}
              {...props}
            />
          </div>
          <div className="ml-3">
            <label
              htmlFor={id}
              className="text-sm font-medium text-gray-700 cursor-pointer"
            >
              {label}
            </label>
            {description && (
              <p id={descriptionId} className="text-sm text-gray-500">
                {description}
              </p>
            )}
          </div>
        </div>
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
// RADIO GROUP - Accessible radio button group
// =============================================================================

export function AccessibleRadioGroup({
  name,
  label,
  options,
  value,
  onChange,
  error,
  orientation = 'vertical',
  required,
}: RadioGroupProps) {
  const groupId = useId();
  const errorId = `${groupId}-error`;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.value);
    },
    [onChange]
  );

  return (
    <fieldset
      className="space-y-3"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="text-sm font-medium text-gray-700">
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">*</span>
        )}
      </legend>
      <div
        className={cn(
          orientation === 'horizontal' ? 'flex flex-wrap gap-6' : 'space-y-3'
        )}
        role="radiogroup"
        aria-required={required}
      >
        {options.map((option) => {
          const optionId = `${groupId}-${option.value}`;
          const descriptionId = option.description
            ? `${optionId}-description`
            : undefined;

          return (
            <div key={option.value} className="flex items-start">
              <div className="flex items-center h-6">
                <input
                  id={optionId}
                  name={name}
                  type="radio"
                  value={option.value}
                  checked={value === option.value}
                  onChange={handleChange}
                  disabled={option.disabled}
                  aria-describedby={descriptionId}
                  className={cn(
                    'h-5 w-5 border-gray-300',
                    'text-blue-600 focus:ring-blue-500 focus:ring-2',
                    'transition-colors duration-200',
                    'cursor-pointer',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                />
              </div>
              <div className="ml-3">
                <label
                  htmlFor={optionId}
                  className={cn(
                    'text-sm font-medium cursor-pointer',
                    option.disabled ? 'text-gray-400' : 'text-gray-700'
                  )}
                >
                  {option.label}
                </label>
                {option.description && (
                  <p
                    id={descriptionId}
                    className="text-sm text-gray-500"
                  >
                    {option.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <p
          id={errorId}
          className="text-sm text-red-600"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}

// =============================================================================
// ACCESSIBLE ALERT - For form-level messages
// =============================================================================

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function AccessibleAlert({
  type,
  title,
  children,
  dismissible,
  onDismiss,
  className,
}: AlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const styles = {
    success: 'bg-green-50 border-green-500 text-green-800',
    error: 'bg-red-50 border-red-500 text-red-800',
    warning: 'bg-yellow-50 border-yellow-500 text-yellow-800',
    info: 'bg-blue-50 border-blue-500 text-blue-800',
  };

  const icons = {
    success: (
      <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
    error: (
      <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg className="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    info: (
      <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
  };

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'rounded-lg border-l-4 p-4',
        styles[type],
        className
      )}
    >
      <div className="flex">
        <div className="flex-shrink-0">
          {icons[type]}
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className="text-sm font-medium">{title}</h3>
          )}
          <div className={cn('text-sm', title && 'mt-1')}>
            {children}
          </div>
        </div>
        {dismissible && (
          <div className="ml-4 flex-shrink-0">
            <button
              type="button"
              onClick={handleDismiss}
              className={cn(
                'inline-flex rounded-md p-1.5',
                'hover:bg-opacity-20 hover:bg-gray-500',
                'focus:outline-none focus:ring-2 focus:ring-offset-2',
                'min-h-[44px] min-w-[44px] flex items-center justify-center'
              )}
              aria-label="Dismiss"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SKIP LINK - For keyboard navigation
// =============================================================================

export function SkipLink({ href = '#main-content', children = 'Skip to main content' }: { href?: string; children?: React.ReactNode }) {
  return (
    <a
      href={href}
      className={cn(
        'sr-only focus:not-sr-only',
        'focus:absolute focus:top-4 focus:left-4 focus:z-50',
        'focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white',
        'focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-white'
      )}
    >
      {children}
    </a>
  );
}

// =============================================================================
// VISUALLY HIDDEN - For screen reader only content
// =============================================================================

export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only">
      {children}
    </span>
  );
}

// =============================================================================
// LIVE REGION - For dynamic announcements
// =============================================================================

interface LiveRegionProps {
  message: string;
  politeness?: 'polite' | 'assertive';
}

export function LiveRegion({ message, politeness = 'polite' }: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}

export default {
  FormField,
  AccessibleTextInput,
  AccessibleTextArea,
  AccessibleSelect,
  AccessibleCheckbox,
  AccessibleRadioGroup,
  AccessibleAlert,
  SkipLink,
  VisuallyHidden,
  LiveRegion,
};
