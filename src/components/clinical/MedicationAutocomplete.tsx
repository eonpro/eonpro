'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

import { apiFetch } from '@/lib/api/fetch';

interface DrugResult {
  name: string;
  genericName?: string;
  rxcui?: string;
  drugClass?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function MedicationAutocomplete({ value, onChange, placeholder, className }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DrugResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/clinical/drug-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((text: string) => {
    onChange(text);

    // Extract the current "word" being typed (after last comma)
    const parts = text.split(',');
    const current = (parts[parts.length - 1] ?? '').trim();
    setQuery(current);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (current.length >= 2) {
      debounceRef.current = setTimeout(() => fetchResults(current), 300);
      setIsOpen(true);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  }, [onChange, fetchResults]);

  const selectResult = useCallback((drug: DrugResult) => {
    const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
    parts.pop(); // remove the partial text
    parts.push(drug.name);
    const newValue = parts.join(', ');
    onChange(newValue);
    setIsOpen(false);
    setResults([]);
    setQuery('');
    inputRef.current?.focus();
  }, [value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1));
        break;
      case 'Enter':
        if (activeIndex >= 0 && activeIndex < results.length) {
          e.preventDefault();
          selectResult(results[activeIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  }, [isOpen, results, activeIndex, selectResult]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (query.length >= 2 && results.length > 0) setIsOpen(true); }}
        placeholder={placeholder ?? 'Type to search medications...'}
        rows={2}
        className={className ?? 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#4fa77e]'}
      />
      {loading && (
        <div className="absolute right-3 top-2.5">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#4fa77e]" />
        </div>
      )}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {results.map((drug, i) => (
            <button
              key={`${drug.name}-${i}`}
              type="button"
              onClick={() => selectResult(drug)}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                i === activeIndex ? 'bg-emerald-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium text-gray-900">{drug.name}</span>
                {drug.genericName && drug.genericName !== drug.name && (
                  <span className="ml-1 text-gray-400">({drug.genericName})</span>
                )}
                {drug.drugClass && (
                  <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                    {drug.drugClass}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
