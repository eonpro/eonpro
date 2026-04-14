'use client';

import cn from '@/app/wellmedr-checkout/lib/cn';
import getNestedError from '@/app/wellmedr-checkout/lib/getNestedError';
import { useFormContext } from 'react-hook-form';

interface InputFieldProps {
  name: string;
  label?: string;
  placeholder?: string;
  type?: string;
  icon?: string;
  className?: string;
  mask?: (value: string) => string;
  id?: string;
}

export default function InputField({
  id,
  name,
  label,
  placeholder,
  type = 'text',
  icon,
  className,
  mask,
}: InputFieldProps) {
  const {
    register,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext();

  const error = getNestedError(name, errors);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const maskedValue = mask ? mask(value) : value;
    setValue(name, maskedValue, { shouldValidate: true });
  };

  const handleBlur = () => {
    const currentValue = getValues(name);
    if (mask) {
      const maskedValue = mask(currentValue);
      setValue(name, maskedValue, { shouldValidate: true });
    }
  };

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      {label && <label className="form-label">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 transform text-gray-400 sm:left-8">
            <img src={icon} alt="" className="h-full w-full" />
          </div>
        )}
        <input
          {...register(name)}
          id={id ? id : undefined}
          type={type}
          placeholder={placeholder}
          className={cn(
            'form-input w-full',
            icon ? 'pl-14 sm:pl-20' : '',
            error ? 'border-red-500' : ''
          )}
          onChange={handleInputChange}
          onBlur={handleBlur}
        />
      </div>
      {error && <span className="block text-sm text-red-500">{error}</span>}
    </div>
  );
}
