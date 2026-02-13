'use client';

/**
 * Patient Search Bar — Premium search experience
 * - 150ms debounce, request cancellation via parent AbortController
 * - Keyboard (Escape to clear), clear button, smart placeholder
 * - Recent searches chips
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

const DEBOUNCE_MS = 150;
const RECENT_SEARCHES_KEY = 'provider-patient-recent-searches';
const RECENT_MAX = 5;

export interface PatientSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  placeholder?: string;
  isSearching?: boolean;
  totalFound?: number;
  recentSearches?: string[];
  onRecentSelect?: (query: string) => void;
  className?: string;
}

export function PatientSearchBar({
  value,
  onChange,
  onSearch,
  placeholder = 'Search by name, email, phone, or patient ID…',
  isSearching = false,
  totalFound,
  recentSearches = [],
  onRecentSelect,
  className = '',
}: PatientSearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(localValue.trim());
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localValue, onSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocalValue(v);
    onChange(v);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleClear();
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        {isSearching ? (
          <Loader2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-green-600" />
        ) : (
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-gray-900 transition-all placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
          aria-label="Search patients"
          autoComplete="off"
        />
        {localValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {(isSearching || (totalFound !== undefined && localValue.trim())) && (
        <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-500">
          {isSearching ? (
            <span className="flex items-center gap-1.5">Searching…</span>
          ) : (
            <span>
              {totalFound === 0
                ? 'No patients match'
                : `${totalFound} patient${totalFound === 1 ? '' : 's'} found`}
            </span>
          )}
        </div>
      )}
      {recentSearches.length > 0 && !localValue && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-400">Recent:</span>
          {recentSearches.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onRecentSelect?.(q)}
              className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const addRecent = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    setRecent((prev) => {
      const next = [q, ...prev.filter((x) => x !== q)].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { recent, addRecent };
}
