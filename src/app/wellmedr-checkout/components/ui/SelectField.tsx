'use client';

import { useFormContext, Controller } from 'react-hook-form';
import { useState } from 'react';
import cn from '@/app/wellmedr-checkout/lib/cn';
import getNestedError from '@/app/wellmedr-checkout/lib/getNestedError';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  name: string;
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export default function SelectField({
  name,
  label,
  options,
  placeholder = 'Select an option',
  required = false,
  className = '',
}: SelectFieldProps) {
  const {
    control,
    trigger,
    formState: { errors },
  } = useFormContext();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const error = getNestedError(name, errors);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={cn('relative flex w-full flex-col gap-2', className)}>
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}

      <Controller
        name={name}
        control={control}
        rules={{
          required: required ? 'This field is required' : false,
        }}
        render={({ field: { value, onChange } }) => {
          const selectedOption = options.find((option) => option.value === value);

          const handleOptionSelect = (optionValue: string) => {
            onChange(optionValue);
            trigger(name);
            setIsOpen(false);
            setSearchTerm(''); // Reset search on select
          };

          const toggleOpen = () => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              // Reset search when opening? User preference usually aligns with keeping previous potential search or clearing.
              // Clearing is safer for "finding something new".
              setSearchTerm('');
            }
          };

          return (
            <>
              <button
                type="button"
                id={name}
                onClick={toggleOpen}
                className={cn(
                  'form-input relative flex w-full items-center justify-between',
                  error ? 'border-red-500' : 'border-border'
                )}
              >
                {/* Placeholder || SelectedOption */}
                <span className={value ? '' : 'opacity-30'}>
                  {selectedOption?.label || placeholder}
                </span>
                <svg
                  className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown */}
              {isOpen && (
                <div className="border-border rounded-smooth absolute top-full z-50 mt-1 flex max-h-60 w-full flex-col overflow-auto border bg-white py-1 shadow-lg sm:max-h-96">
                  <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-2 py-1">
                    <input
                      type="text"
                      className="form-input h-12 w-full rounded-lg px-2"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto sm:max-h-56 2xl:max-h-72">
                    {filteredOptions.length > 0 ? (
                      filteredOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleOptionSelect(option.value)}
                          className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
                            value === option.value
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-gray-900'
                          }`}
                        >
                          <span className="label text-base sm:text-base">{option.label}</span>
                        </button>
                      ))
                    ) : (
                      <span className="block p-4 text-center opacity-50">No options found</span>
                    )}
                  </div>
                </div>
              )}
            </>
          );
        }}
      />

      {error && <span className="block text-sm text-red-500">{error}</span>}
    </div>
  );
}
