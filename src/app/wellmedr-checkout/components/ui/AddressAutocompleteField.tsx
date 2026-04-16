'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { MapPin } from 'lucide-react';
import cn from '@/app/wellmedr-checkout/lib/cn';
import getNestedError from '@/app/wellmedr-checkout/lib/getNestedError';
import {
  attachAutocomplete,
  useGooglePlacesReady,
  type AddressData,
} from '@/components/AddressAutocomplete';

interface AddressAutocompleteFieldProps {
  /** react-hook-form field prefix, e.g. "shippingAddress" or "billingAddress" */
  fieldPrefix: string;
  label?: string;
  placeholder?: string;
  className?: string;
  /** Called after Google Places fills city/state/zip so parent can lock those fields */
  onPlaceSelected?: () => void;
}

export default function AddressAutocompleteField({
  fieldPrefix,
  label = 'Address',
  placeholder = 'Start typing your address...',
  className,
  onPlaceSelected,
}: AddressAutocompleteFieldProps) {
  const {
    register,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = useFormContext();

  const googleReady = useGooglePlacesReady();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  onPlaceSelectedRef.current = onPlaceSelected;

  const fieldName = `${fieldPrefix}.address`;
  const error = getNestedError(fieldName, errors);
  const fieldId = fieldName.replace(/\./g, '-');

  const { ref: rhfRef, ...registerProps } = register(fieldName);

  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      rhfRef(el);
      inputRef.current = el;
    },
    [rhfRef]
  );

  useEffect(() => {
    if (!googleReady || !inputRef.current) return;

    cleanupRef.current?.();
    cleanupRef.current = attachAutocomplete(inputRef.current, (parsed: AddressData) => {
      setValue(fieldName, parsed.address1, { shouldValidate: true, shouldDirty: true });
      if (parsed.city) {
        setValue(`${fieldPrefix}.city`, parsed.city, { shouldValidate: true, shouldDirty: true });
      }
      if (parsed.state) {
        setValue(`${fieldPrefix}.state`, parsed.state, { shouldValidate: true, shouldDirty: true });
      }
      if (parsed.zip) {
        setValue(`${fieldPrefix}.zipCode`, parsed.zip, { shouldValidate: true, shouldDirty: true });
      }

      trigger([
        `${fieldPrefix}.city`,
        `${fieldPrefix}.state`,
        `${fieldPrefix}.zipCode`,
      ]);

      onPlaceSelectedRef.current?.();
    });

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [googleReady, fieldName, fieldPrefix, setValue, trigger]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(fieldName, e.target.value, { shouldValidate: true });
  };

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      {label && (
        <label htmlFor={fieldId} className="form-label">
          {label}
        </label>
      )}
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          {...registerProps}
          ref={setInputRef}
          id={fieldId}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={!!error}
          className={cn(
            'form-input w-full pl-11',
            error ? 'border-red-500' : ''
          )}
          onChange={handleChange}
        />
      </div>
      {error && (
        <span className="block text-sm text-red-500" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
