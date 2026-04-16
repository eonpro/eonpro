'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';
interface WmCurrentMedsStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const COMMON_MEDS = [
  'Semaglutide',
  'Tirzepatide',
  'Ozempic',
  'Wegovy',
  'Zepbound',
  'Mounjaro',
];

const medsList = COMMON_MEDS.map((name) => ({
  id: name.toLowerCase(),
  display: name,
  name,
}));

export default function WmCurrentMedsStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmCurrentMedsStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const [answer, setAnswer] = useState<string>(String(responses.current_medications || ''));
  const [selectedMeds, setSelectedMeds] = useState<string[]>(() => {
    const existing = responses.current_medications_list;
    if (Array.isArray(existing)) return existing as string[];
    const detail = String(responses.current_medications_detail || '');
    return detail
      ? detail
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  });
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const filtered = useMemo(() => {
    const available = medsList.filter((m) => !selectedMeds.includes(m.display));
    if (!search.trim()) return available;
    const q = search.trim().toLowerCase();
    return available.filter((m) => m.display.toLowerCase().includes(q));
  }, [search, selectedMeds]);

  const handleSelect = (opt: string) => {
    navigator.vibrate?.(10);
    setAnswer(opt);
    if (opt === 'no') {
      setResponse('current_medications', 'no');
      setResponse('current_medications_list', []);
      setResponse('current_medications_detail', '');
      markStepCompleted('current-meds');
      setTimeout(() => {
        setCurrentStep(nextStep);
        router.push(`${basePath}/${nextStep}`);
      }, 300);
    }
  };

  const addMed = (med: string) => {
    if (!med.trim() || selectedMeds.includes(med)) return;
    const updated = [...selectedMeds, med];
    setSelectedMeds(updated);
    setSearch('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeMed = (med: string) => {
    setSelectedMeds(selectedMeds.filter((m) => m !== med));
  };

  const handleContinue = () => {
    if (answer !== 'yes' || selectedMeds.length === 0) return;
    setResponse('current_medications', 'yes');
    setResponse('current_medications_list', selectedMeds);
    setResponse('current_medications_detail', selectedMeds.join(', '));
    markStepCompleted('current-meds');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };


  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault();
      if (filtered.length > 0) {
        addMed(filtered[0].display);
      } else {
        addMed(search.trim());
      }
    }
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
          Do you currently take any medications?
          <span className="ml-1" style={{ color: '#ef4444' }}>
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

            {/* Selected medications */}
            {selectedMeds.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {selectedMeds.map((med) => (
                  <div
                    key={med}
                    className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: '#f5f0e8',
                      border: '1px solid #c3b29e',
                      color: '#101010',
                    }}
                  >
                    <span className="max-w-[200px] truncate">{med}</span>
                    <button
                      onClick={() => removeMed(med)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/10"
                      aria-label={`Remove ${med}`}
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

            {/* Search input */}
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                className="wm-input"
                placeholder="Select or type a medication..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
              />

              {/* Dropdown */}
              {showDropdown && (filtered.length > 0 || search.trim()) && (
                <div
                  ref={dropdownRef}
                  className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border bg-white shadow-lg"
                  style={{ borderColor: 'rgba(53,28,12,0.12)', maxHeight: 320 }}
                >
                  <div
                    className="overflow-y-auto"
                    style={{ maxHeight: 320, WebkitOverflowScrolling: 'touch' }}
                  >
                    {filtered.map((med) => (
                      <button
                        key={med.id}
                        type="button"
                        onClick={() => addMed(med.display)}
                        className="w-full border-b px-5 py-3.5 text-left text-base font-medium transition-colors hover:bg-gray-50"
                        style={{ borderColor: 'rgba(0,0,0,0.04)', color: '#101010' }}
                      >
                        {med.name}
                      </button>
                    ))}
                    {filtered.length === 0 && search.trim() && (
                      <button
                        type="button"
                        onClick={() => addMed(search.trim())}
                        className="w-full px-5 py-3.5 text-left text-base transition-colors hover:bg-gray-50"
                        style={{ color: '#101010' }}
                      >
                        <span className="font-medium">Add &ldquo;{search.trim()}&rdquo;</span>
                        <span className="ml-1 text-sm" style={{ color: '#7B95A9' }}>
                          (other)
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <p className="mt-2 text-xs" style={{ color: '#999' }}>
              Select a medication from the list. Type a name and press Enter to add one not listed.
            </p>
          </div>
        )}
      </div>

      {answer === 'yes' && (
        <div className="mx-auto w-full max-w-[600px] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-[31rem] sm:px-8">
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
