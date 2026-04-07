'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { apiFetch } from '@/lib/api/fetch';

interface AllergyResult {
  name: string;
  category: 'drug' | 'food' | 'environmental';
  drugClass?: string;
}

const CATEGORY_COLORS: Record<string, { pill: string; badge: string; badgeLabel: string }> = {
  drug: { pill: 'bg-red-50 text-red-800 ring-red-200', badge: 'bg-red-50 text-red-600', badgeLabel: 'Drug' },
  food: { pill: 'bg-amber-50 text-amber-800 ring-amber-200', badge: 'bg-amber-50 text-amber-600', badgeLabel: 'Food' },
  environmental: { pill: 'bg-blue-50 text-blue-800 ring-blue-200', badge: 'bg-blue-50 text-blue-600', badgeLabel: 'Env' },
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function parseItems(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export default function AllergyAutocomplete({ value, onChange, placeholder }: Props) {
  const items = useMemo(() => parseItems(value), [value]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AllergyResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const emitChange = useCallback((newItems: string[]) => {
    onChange(newItems.join(', '));
  }, [onChange]);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/clinical/allergy-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length >= 2) {
      debounceRef.current = setTimeout(() => fetchResults(text.trim()), 300);
      setIsOpen(true);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  }, [fetchResults]);

  const addItem = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (items.some((it) => it.toLowerCase() === trimmed.toLowerCase())) return;
    emitChange([...items, trimmed]);
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, [items, emitChange]);

  const removeItem = useCallback((index: number) => {
    emitChange(items.filter((_, i) => i !== index));
  }, [items, emitChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isOpen && results.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0));
          return;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1));
          return;
        case 'Enter':
          if (activeIndex >= 0 && activeIndex < results.length) {
            e.preventDefault();
            addItem(results[activeIndex].name);
            return;
          }
          break;
        case 'Escape':
          setIsOpen(false);
          return;
      }
    }
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      addItem(query);
    }
    if (e.key === 'Backspace' && !query && items.length > 0) {
      removeItem(items.length - 1);
    }
  }, [isOpen, results, activeIndex, query, items, addItem, removeItem]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 focus-within:border-transparent focus-within:ring-2 focus-within:ring-[#4fa77e]"
        onClick={() => inputRef.current?.focus()}
      >
        {items.map((item, i) => {
          const colors = CATEGORY_COLORS.drug; // default; ideally we'd cache the category
          return (
            <span
              key={`${item}-${i}`}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${colors.pill}`}
            >
              {item}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeItem(i); }}
                className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.length >= 2 && results.length > 0) setIsOpen(true); }}
          placeholder={items.length === 0 ? (placeholder ?? 'Search allergies...') : 'Add more...'}
          className="min-w-[120px] flex-1 border-none bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-gray-400"
        />
        {loading && (
          <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-[#4fa77e]" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((item, i) => {
            const cat = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.drug;
            return (
              <button
                key={`${item.name}-${i}`}
                type="button"
                onClick={() => addItem(item.name)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === activeIndex ? 'bg-emerald-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="font-medium text-gray-900">{item.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cat.badge}`}>
                  {cat.badgeLabel}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
