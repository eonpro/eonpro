'use client';

import React from 'react';

interface IconButtonProps {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  variant?: 'ghost' | 'subtle' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}

const variantClasses = {
  ghost: 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
  subtle: 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50',
  danger: 'text-gray-400 hover:text-red-600 hover:bg-red-50',
};

const sizeClasses = {
  sm: 'p-1 rounded',
  md: 'p-1.5 rounded-lg',
};

export default function IconButton({
  onClick,
  title,
  disabled = false,
  variant = 'ghost',
  size = 'sm',
  className = '',
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-colors ${variantClasses[variant]} ${sizeClasses[size]} ${disabled ? 'pointer-events-none cursor-not-allowed opacity-30' : ''} ${className} `}
    >
      {children}
    </button>
  );
}
