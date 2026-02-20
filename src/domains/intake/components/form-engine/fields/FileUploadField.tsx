'use client';

import React, { useRef, useState } from 'react';

interface FileUploadFieldProps {
  id: string;
  label?: string;
  accept?: string;
  maxSizeMB?: number;
  value: string;
  onChange: (fileUrl: string) => void;
  error?: string;
  disabled?: boolean;
}

export default function FileUploadField({
  id,
  label = 'Upload file',
  accept = 'image/*,.pdf',
  maxSizeMB = 10,
  value,
  onChange,
  error,
  disabled = false,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [localError, setLocalError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      setLocalError(`File must be under ${maxSizeMB}MB`);
      return;
    }

    setLocalError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setFileName('');
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const displayError = error || localError;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm text-gray-600 mb-2">
          {label}
        </label>
      )}
      <div
        className={`
          border-2 border-dashed rounded-2xl p-6 text-center transition-all
          ${displayError ? 'border-red-500' : 'border-gray-200 hover:border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          disabled={disabled}
          className="sr-only"
        />
        {value && fileName ? (
          <div className="flex items-center justify-center gap-2">
            <svg
              className="w-5 h-5 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm text-gray-700">{fileName}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="ml-2 text-sm text-gray-400 hover:text-gray-600"
            >
              Remove
            </button>
          </div>
        ) : (
          <div>
            <svg
              className="w-8 h-8 mx-auto text-gray-300 mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-gray-500">
              Click to upload (max {maxSizeMB}MB)
            </p>
          </div>
        )}
      </div>
      {displayError && (
        <p className="mt-2 text-sm text-red-500" role="alert">
          {displayError}
        </p>
      )}
    </div>
  );
}
