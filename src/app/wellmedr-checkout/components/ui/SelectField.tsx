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
    option.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className={cn('relative w-full flex flex-col gap-2', className)}>
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <Controller
        name={name}
        control={control}
        rules={{
          required: required ? 'This field is required' : false,
        }}
        render={({ field: { value, onChange } }) => {
          const selectedOption = options.find(
            (option) => option.value === value,
          );

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
                  'relative w-full form-input flex justify-between items-center',
                  error ? 'border-red-500' : 'border-border',
                )}
              >
                {/* Placeholder || SelectedOption */}
                <span className={value ? '' : 'opacity-30'}>
                  {selectedOption?.label || placeholder}
                </span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
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
                <div className="absolute mt-1 z-50 w-full top-full bg-white border border-border py-1 rounded-smooth shadow-lg max-h-60 sm:max-h-96 overflow-auto flex flex-col">
                  <div className="p-2 py-1 sticky top-0 bg-white border-b border-gray-100 z-10">
                    <input
                      type="text"
                      className="w-full form-input rounded-lg h-12 px-2"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto max-h-48 sm:max-h-56 2xl:max-h-72">
                    {filteredOptions.length > 0 ? (
                      filteredOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleOptionSelect(option.value)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none transition-colors ${
                            value === option.value
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-gray-900'
                          }`}
                        >
                          <span className="label text-base sm:text-base">
                            {option.label}
                          </span>
                        </button>
                      ))
                    ) : (
                      <span className="p-4 text-center opacity-50 block">
                        No options found
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          );
        }}
      />

      {error && <span className="block text-red-500 text-sm">{error}</span>}
    </div>
  );
}
