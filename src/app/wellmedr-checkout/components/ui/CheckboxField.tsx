'use client';

import { useFormContext, Controller } from 'react-hook-form';
import { ReactNode } from 'react';
import cn from '@/app/wellmedr-checkout/lib/cn';

interface CheckboxFieldProps {
  name: string;
  label: ReactNode;
  className?: string;
}

export default function CheckboxField({
  name,
  label,
  className,
}: CheckboxFieldProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext();
  const error = errors[name]?.message as string;

  return (
    <div className={cn('w-full', className)}>
      <Controller
        name={name}
        control={control}
        render={({ field: { value, onChange } }) => (
          <label className="flex gap-4 cursor-pointer transition-all">
            <div
              className={cn(
                'w-6 h-6 rounded border-2 flex items-center justify-center',
                value
                  ? 'border-primary bg-primary text-white'
                  : 'border-border',
              )}
            >
              {value ? (
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <span aria-hidden className="w-5 h-5"></span> // Placeholder to maintain size
              )}
            </div>

            <input
              type="checkbox"
              id={name}
              name={name}
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              className="sr-only"
            />

            <span className="label select-none">{label}</span>
          </label>
        )}
      />
      {error && <span className="block text-red-500 text-sm">{error}</span>}
    </div>
  );
}
