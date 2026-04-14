'use client';

import React, { useState } from 'react';
import type { LocalizedString } from '../state/builderTypes';

interface LocalizedInputProps {
  value: LocalizedString;
  onChange: (value: LocalizedString) => void;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
}

export default function LocalizedInput({
  value,
  onChange,
  label,
  placeholder,
  multiline = false,
  rows = 3,
  className = '',
}: LocalizedInputProps) {
  const [showEs, setShowEs] = useState(false);

  const handleChange = (lang: 'en' | 'es', text: string) => {
    onChange({ ...value, [lang]: text });
  };

  const inputClasses =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors';

  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-wider text-gray-600">
            {label}
          </label>
          <button
            type="button"
            onClick={() => setShowEs(!showEs)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              showEs
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {showEs ? 'EN + ES' : 'EN'}
          </button>
        </div>
      )}

      {multiline ? (
        <textarea
          value={value.en}
          onChange={(e) => handleChange('en', e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={inputClasses}
        />
      ) : (
        <input
          type="text"
          value={value.en}
          onChange={(e) => handleChange('en', e.target.value)}
          placeholder={placeholder}
          className={inputClasses}
        />
      )}

      {showEs && (
        <div className="mt-1.5">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">
              ES
            </span>
          </div>
          {multiline ? (
            <textarea
              value={value.es}
              onChange={(e) => handleChange('es', e.target.value)}
              placeholder={`${placeholder || ''} (Spanish)`}
              rows={rows}
              className={inputClasses}
            />
          ) : (
            <input
              type="text"
              value={value.es}
              onChange={(e) => handleChange('es', e.target.value)}
              placeholder={`${placeholder || ''} (Spanish)`}
              className={inputClasses}
            />
          )}
        </div>
      )}
    </div>
  );
}
