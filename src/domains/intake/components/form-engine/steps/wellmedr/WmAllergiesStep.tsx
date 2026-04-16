'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface AllergenResult {
  name: string;
  category?: string;
  drugClass?: string;
}

interface WmAllergiesStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmAllergiesStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmAllergiesStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const [answer, setAnswer] = useState<string>(String(responses.known_allergies || ''));
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>(() => {
    const existing = responses.known_allergies_list;
    if (Array.isArray(existing)) return existing as string[];
    const detail = String(responses.known_allergies_detail || '');
    return detail
      ? detail
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AllergenResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!showDropdown) return;
    const onClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showDropdown]);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/intake-forms/allergy-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch {
      /* network error — ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearch(text);
    setShowDropdown(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length >= 2) {
      debounceRef.current = setTimeout(() => fetchResults(text.trim()), 300);
    } else {
      setResults([]);
    }
  };

  const handleSelect = (opt: string) => {
    navigator.vibrate?.(10);
    setAnswer(opt);
    if (opt === 'no') {
      setResponse('known_allergies', 'no');
      setResponse('known_allergies_list', []);
      setResponse('known_allergies_detail', '');
      markStepCompleted('known-allergies');
      setTimeout(() => {
        setCurrentStep(nextStep);
        router.push(`${basePath}/${nextStep}`);
      }, 300);
    }
  };

  const addAllergy = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || selectedAllergies.some((a) => a.toLowerCase() === trimmed.toLowerCase())) return;
    setSelectedAllergies((prev) => [...prev, trimmed]);
    setSearch('');
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeAllergy = (name: string) => {
    setSelectedAllergies(selectedAllergies.filter((a) => a !== name));
  };

  const handleContinue = () => {
    if (answer !== 'yes' || selectedAllergies.length === 0) return;
    setResponse('known_allergies', 'yes');
    setResponse('known_allergies_list', selectedAllergies);
    setResponse('known_allergies_detail', selectedAllergies.join(', '));
    markStepCompleted('known-allergies');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };


  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault();
      if (results.length > 0) {
        addAllergy(results[0].name);
      } else {
        addAllergy(search.trim());
      }
    }
  };

  const filteredResults = results.filter(
    (r) => !selectedAllergies.some((a) => a.toLowerCase() === r.name.toLowerCase())
  );

  const categoryColors: Record<string, string> = {
    drug: 'bg-blue-50 text-blue-600',
    food: 'bg-orange-50 text-orange-600',
    environmental: 'bg-green-50 text-green-600',
  };

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <style>{`
        .wm-input {
          width: 100%;
          height: 64px;
          padding: 0 2rem;
          font-size: 1rem;
          font-weight: 500;
          color: #101010;
          background-color: #fff;
          border: 1px solid rgba(53, 28, 12, 0.12);
          border-radius: 20px;
          outline: none;
          letter-spacing: -0.01em;
          line-height: 1.5rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .wm-input:focus {
          border-color: #7b95a9;
          box-shadow: 0 0 0 2px #7b95a9;
        }
        .wm-input::placeholder {
          opacity: 0.3; color: #101010; font-weight: 400;
        }
        @media (min-width: 640px) {
          .wm-input { height: 72px; font-size: 1.25rem; }
        }
      `}</style>

      <div className="h-[3px] w-full" style={{ backgroundColor: '#e5e0d8' }}>
        <div
          className="h-full"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: '#c3b29e',
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>

      <div className="mx-auto grid w-full max-w-[48rem] grid-cols-3 items-center px-6 pt-4">
        <div />
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      <div
        className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center px-6 pb-6 sm:px-8"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(6px)',
          transition: 'all 0.3s ease-out',
        }}
      >
        <h2
          className="mb-6 text-center text-xl font-bold sm:text-[1.5rem]"
          style={{ color: '#101010' }}
        >
          Do you have any known allergies?
          <span className="ml-1" style={{ color: '#c3b29e' }}>
            *
          </span>
        </h2>

        <div className="mb-4 grid w-full grid-cols-2 gap-3">
          {['yes', 'no'].map((opt, i) => (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className="flex items-center gap-3 overflow-hidden rounded-[18px] px-5 py-4"
              style={{
                backgroundColor: answer === opt ? '#f5f0e8' : '#fff',
                border: `2px solid ${answer === opt ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                boxShadow:
                  answer === opt
                    ? '0 0 0 2px #c3b29e, 0 2px 8px rgba(195,178,158,0.15)'
                    : '0 1px 3px rgba(0,0,0,0.04)',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'scale(1)' : 'scale(0.95)',
                transition: `all 0.35s cubic-bezier(0.4,0,0.2,1) ${0.15 + i * 0.05}s`,
              }}
            >
              <div
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                style={{
                  border: `2px solid ${answer === opt ? '#0C2631' : '#d1d5db'}`,
                  backgroundColor: answer === opt ? '#0C2631' : 'transparent',
                  transition: 'all 0.25s ease',
                }}
              >
                {answer === opt && <div className="h-2.5 w-2.5 rounded-full bg-white" />}
              </div>
              <span className="text-[15px] font-medium" style={{ color: '#101010' }}>
                {opt === 'yes' ? 'Yes' : 'No'}
              </span>
            </button>
          ))}
        </div>

        {answer === 'yes' && (
          <div className="mt-2 w-full" style={{ animation: 'wmSlideDown 0.3s ease-out' }}>
            <style>{`@keyframes wmSlideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>

            {selectedAllergies.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {selectedAllergies.map((allergy) => (
                  <div
                    key={allergy}
                    className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: '#f5f0e8',
                      border: '1px solid #c3b29e',
                      color: '#101010',
                    }}
                  >
                    <span className="max-w-[200px] truncate">{allergy}</span>
                    <button
                      onClick={() => removeAllergy(allergy)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/10"
                      aria-label={`Remove ${allergy}`}
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                className="wm-input"
                placeholder="Search allergies..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (search.trim().length >= 2 && results.length > 0) setShowDropdown(true);
                }}
                onKeyDown={handleKeyDown}
              />
              {loading && (
                <div
                  className="absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-gray-300"
                  style={{ borderTopColor: '#c3b29e' }}
                />
              )}

              {showDropdown && search.trim().length >= 2 && (
                <div
                  ref={dropdownRef}
                  className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border bg-white shadow-lg"
                  style={{ borderColor: 'rgba(53,28,12,0.12)', maxHeight: 320 }}
                >
                  <div
                    className="overflow-y-auto"
                    style={{ maxHeight: 320, WebkitOverflowScrolling: 'touch' }}
                  >
                    {filteredResults.map((allergen, i) => (
                      <button
                        key={`${allergen.name}-${i}`}
                        type="button"
                        onClick={() => addAllergy(allergen.name)}
                        className="w-full border-b px-5 py-3.5 text-left text-base transition-colors hover:bg-gray-50"
                        style={{ borderColor: 'rgba(0,0,0,0.04)', color: '#101010' }}
                      >
                        <span className="font-medium">{allergen.name}</span>
                        {allergen.category && (
                          <span
                            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryColors[allergen.category] ?? 'bg-gray-50 text-gray-600'}`}
                          >
                            {allergen.category}
                          </span>
                        )}
                      </button>
                    ))}
                    {filteredResults.length === 0 && !loading && (
                      <button
                        type="button"
                        onClick={() => addAllergy(search.trim())}
                        className="w-full px-5 py-3.5 text-left text-base transition-colors hover:bg-gray-50"
                        style={{ color: '#101010' }}
                      >
                        <span className="font-medium">Add &ldquo;{search.trim()}&rdquo;</span>
                        <span className="ml-1 text-sm" style={{ color: '#7B95A9' }}>
                          (custom)
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <p className="mt-2 text-xs" style={{ color: '#999' }}>
              Search and add each allergy. Type a name and press Enter if not found.
            </p>
          </div>
        )}
      </div>

      {answer === 'yes' && (
        <div className="mx-auto w-full max-w-[600px] px-6 pb-6 sm:max-w-[31rem] sm:px-8">
          <button
            onClick={handleContinue}
            className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full text-base font-normal text-white active:scale-[0.98] sm:text-[1.125rem]"
            style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
          >
            Next <span aria-hidden="true">&#10132;</span>
          </button>
        </div>
      )}
    </div>
  );
}
