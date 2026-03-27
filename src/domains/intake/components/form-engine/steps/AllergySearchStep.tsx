'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface AllergenResult {
  name: string;
  category?: string;
  drugClass?: string;
}

interface AllergySearchStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function AllergySearchStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: AllergySearchStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const responses = useIntakeStore((s) => s.responses);
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';

  const existing = String(responses.allergy_details ?? '');
  const [items, setItems] = useState<string[]>(() =>
    existing ? existing.split(',').map((s) => s.trim()).filter(Boolean) : [],
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AllergenResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/intake-forms/allergy-search?q=${encodeURIComponent(q)}`);
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
    setItems((prev) => [...prev, trimmed]);
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, [items]);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isOpen && results.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1)); return; }
      if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); addItem(results[activeIndex].name); return; }
      if (e.key === 'Escape') { setIsOpen(false); return; }
    }
    if (e.key === 'Enter' && query.trim()) { e.preventDefault(); addItem(query); }
    if (e.key === 'Backspace' && !query && items.length > 0) { removeItem(items.length - 1); }
  }, [isOpen, results, activeIndex, query, items, addItem, removeItem]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleContinue = () => {
    if (items.length > 0) {
      setResponse('allergy_details', items.join(', '));
      markStepCompleted('allergy-details');
      setCurrentStep(nextStep);
      router.push(`${basePath}/${nextStep}`);
    }
  };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  const accentColor = isOt ? '#cab172' : '#4fa87f';
  const chipBg = isOt ? 'bg-[#f5ecd8]' : 'bg-emerald-50';
  const chipText = isOt ? 'text-[#413d3d]' : 'text-emerald-800';
  const chipRing = isOt ? 'ring-[#cab172]/30' : 'ring-emerald-200';
  const chipClose = isOt ? 'text-[#cab172] hover:bg-[#f5ecd8] hover:text-[#413d3d]' : 'text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700';

  const categoryLabel = (cat?: string) => {
    if (!cat) return null;
    const colors: Record<string, string> = {
      drug: 'bg-blue-50 text-blue-600',
      food: 'bg-orange-50 text-orange-600',
      environmental: 'bg-green-50 text-green-600',
    };
    return (
      <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[cat] ?? 'bg-gray-50 text-gray-600'}`}>
        {cat}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full h-1 bg-gray-100">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {prevStep && (
        <div className="px-6 lg:px-8 pt-6 max-w-md lg:max-w-2xl mx-auto w-full">
          <button onClick={handleBack} className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 px-6 lg:px-8 py-4 pb-48 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-4">
          <div>
            <h1 className="page-title mb-2">
              {isSpanish ? '¿A qué eres alérgico?' : 'What are you allergic to?'}
            </h1>
            <p className="page-subtitle text-sm">
              {isSpanish ? 'Busca y agrega tus alergias.' : 'Search and add your allergies.'}
            </p>
          </div>

          <div ref={wrapperRef} className="relative">
            <div
              className="flex items-center rounded-lg border border-gray-300 px-3 py-2.5 focus-within:border-transparent focus-within:ring-2"
              style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
              onClick={() => inputRef.current?.focus()}
            >
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (query.length >= 2 && results.length > 0) setIsOpen(true); }}
                placeholder={isSpanish ? 'Buscar alergias...' : 'Search allergies...'}
                className="flex-1 border-none bg-transparent text-sm font-medium text-[#1f2937] outline-none placeholder:text-gray-400"
              />
              {loading && (
                <div
                  className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-gray-300"
                  style={{ borderTopColor: accentColor }}
                />
              )}
            </div>

            {isOpen && results.length > 0 && (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {results.map((allergen, i) => (
                  <button
                    key={`${allergen.name}-${i}`}
                    type="button"
                    onClick={() => addItem(allergen.name)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      i === activeIndex ? (isOt ? 'bg-[#f5ecd8]' : 'bg-emerald-50') : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-gray-900">{allergen.name}</span>
                      {categoryLabel(allergen.category)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {items.map((item, i) => (
                <span
                  key={`${item}-${i}`}
                  className={`inline-flex items-center gap-1.5 rounded-full ${chipBg} px-3 py-1.5 text-sm font-medium ${chipText} ring-1 ${chipRing}`}
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className={`ml-0.5 rounded-full p-0.5 ${chipClose}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sticky-bottom-button max-w-md lg:max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={items.length === 0}
          className="continue-button"
        >
          <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
