'use client';

import React, { ButtonHTMLAttributes, forwardRef } from 'react';

interface AccessibleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual label for the button */
  children: React.ReactNode;
  /** Screen reader label (if different from visual) */
  ariaLabel?: string;
  /** Loading state */
  loading?: boolean;
  /** Variant style */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  /** Full width */
  fullWidth?: boolean;
  /** Icon only button */
  iconOnly?: boolean;
}

const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  (
    {
      children,
      ariaLabel,
      loading = false,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      iconOnly = false,
      disabled,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

    // Variant styles
    const variantStyles = {
      primary: 'bg-[#4fa77e] text-white hover:bg-[#3f8660] focus:ring-[#4fa77e]',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
    };

    // Size styles
    const sizeStyles = {
      sm: iconOnly ? 'p-1.5' : 'px-3 py-1.5 text-sm',
      md: iconOnly ? 'p-2' : 'px-4 py-2 text-sm',
      lg: iconOnly ? 'p-3' : 'px-6 py-3 text-base',
    };

    // Border radius
    const radiusStyles = iconOnly ? 'rounded-full' : 'rounded-lg';

    // Width
    const widthStyles = fullWidth ? 'w-full' : '';

    // Min touch target (44px for accessibility)
    const touchTarget = 'min-h-[44px] min-w-[44px]';

    const combinedClassName = [
      baseStyles,
      variantStyles[variant],
      sizeStyles[size],
      radiusStyles,
      widthStyles,
      touchTarget,
      className,
    ].join(' ');

    return (
      <button
        ref={ref}
        type={type}
        className={combinedClassName}
        disabled={disabled || loading}
        aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
        aria-busy={loading}
        aria-disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="-ml-1 mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="sr-only">Loading...</span>
            {!iconOnly && children}
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

AccessibleButton.displayName = 'AccessibleButton';

export default AccessibleButton;
