'use client';

import { useFormContext, Controller } from 'react-hook-form';
import { ReactNode } from 'react';
import cn from '@/app/wellmedr-checkout/lib/cn';

interface CheckboxFieldProps {
  name: string;
  label: ReactNode;
  className?: string;
}

export default function CheckboxField({ name, label, className }: CheckboxFieldProps) {
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
          <label className="flex min-h-[44px] cursor-pointer items-center gap-4 transition-all">
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded border-2',
                value ? 'border-primary bg-primary text-white' : 'border-border'
              )}
            >
              {value ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <span aria-hidden className="h-5 w-5"></span> // Placeholder to maintain size
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
      {error && <span className="block text-sm text-red-500" role="alert">{error}</span>}
    </div>
  );
}
