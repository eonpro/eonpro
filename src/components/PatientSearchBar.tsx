'use client';

/**
 * Patient Search Bar — Premium search experience
 * - 300ms debounce for typing comfort, request cancellation via parent AbortController
 * - Keyboard (Escape to clear), clear button, smart placeholder
 * - Recent searches chips with search hints
 * - Case-insensitive, partial match (first name, last name, patient ID, email, phone)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

const DEBOUNCE_MS = 300;
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
  onClear?: () => void;
  className?: string;
}

export function PatientSearchBar({
  value,
  onChange,
  onSearch,
  placeholder = 'Search by name, email, phone, or patient ID...',
  isSearching = false,
  totalFound,
  recentSearches = [],
  onRecentSelect,
  onClear,
  className = '',
}: PatientSearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
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
    onClear?.();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleClear();
  };

  const hasQuery = localValue.trim().length > 0;
  const showResults = !isSearching && totalFound !== undefined && hasQuery;
  const showNoResults = showResults && totalFound === 0;

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        {isSearching ? (
          <Loader2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-green-600" />
        ) : (
          <Search className={`absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transition-colors ${isFocused ? 'text-green-500' : 'text-gray-400'}`} />
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-10 text-gray-900 transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
            showNoResults
              ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200/50'
              : 'border-gray-200 focus:border-green-500 focus:ring-green-500/20'
          }`}
          aria-label="Search patients"
          autoComplete="off"
        />
        {localValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search status */}
      {isSearching && (
        <div className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-500">
          <span>Searching...</span>
        </div>
      )}

      {showResults && totalFound! > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5 text-sm text-green-600">
          <span>{totalFound} patient{totalFound === 1 ? '' : 's'} found</span>
        </div>
      )}

      {showNoResults && (
        <div className="mt-1.5 text-sm text-amber-600">
          <span>No patients match</span>
          <span className="ml-1 text-gray-400">
            — try a different spelling, email, phone, or patient ID
          </span>
        </div>
      )}

      {/* Recent searches */}
      {recentSearches.length > 0 && !hasQuery && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400">Recent:</span>
          {recentSearches.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onRecentSelect?.(q)}
              className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-green-50 hover:text-green-700"
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
