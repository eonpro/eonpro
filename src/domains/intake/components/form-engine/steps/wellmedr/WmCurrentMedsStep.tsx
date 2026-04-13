'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';
import { MEDS } from '@/lib/medications';
import { normalizedIncludes } from '@/lib/utils/search';

interface WmCurrentMedsStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const medsList = Object.values(MEDS).map((m) => {
  const display = m.strength
    ? `${m.name} ${m.strength}${m.formLabel ? ` (${m.formLabel})` : ''}`
    : m.name;
  return { id: String(m.id), display, name: m.name };
});

export default function WmCurrentMedsStep({ basePath, nextStep, prevStep, progressPercent }: WmCurrentMedsStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  const [answer, setAnswer] = useState<string>(String(responses.current_medications || ''));
  const [selectedMeds, setSelectedMeds] = useState<string[]>(() => {
    const existing = responses.current_medications_list;
    if (Array.isArray(existing)) return existing as string[];
    const detail = String(responses.current_medications_detail || '');
    return detail ? detail.split(',').map((s) => s.trim()).filter(Boolean) : [];
  });
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showDropdown]);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    return medsList
      .filter((m) => normalizedIncludes(m.display, search) && !selectedMeds.includes(m.display))
      .slice(0, 8);
  }, [search, selectedMeds]);

  const handleSelect = (opt: string) => {
    navigator.vibrate?.(10);
    setAnswer(opt);
    if (opt === 'no') {
      setResponse('current_medications', 'no');
      setResponse('current_medications_list', []);
      setResponse('current_medications_detail', '');
      markStepCompleted('current-meds');
      setTimeout(() => { setCurrentStep(nextStep); router.push(`${basePath}/${nextStep}`); }, 300);
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

  const handleBack = () => {
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
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
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
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

      <div className="w-full h-[3px]" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      <div className="w-full max-w-[48rem] mx-auto px-6 pt-4 grid grid-cols-3 items-center">
        <div>
          {prevStep && (
            <button onClick={handleBack} className="p-2.5 rounded-lg hover:bg-black/5 active:scale-95 transition-all" aria-label="Go back">
              <svg className="w-5 h-5" style={{ color: '#101010' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
        </div>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      <div className="flex flex-1 flex-col justify-center w-full max-w-[600px] mx-auto px-6 sm:px-8 pb-6"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(6px)', transition: 'all 0.3s ease-out' }}>

        <h2 className="text-xl sm:text-[1.5rem] font-bold text-center mb-6" style={{ color: '#101010' }}>
          Do you currently take any medications?
          <span className="ml-1" style={{ color: '#c3b29e' }}>*</span>
        </h2>

        <div className="grid grid-cols-2 gap-3 w-full mb-4">
          {['yes', 'no'].map((opt, i) => (
            <button key={opt} onClick={() => handleSelect(opt)}
              className="flex items-center gap-3 px-5 py-4 rounded-[18px] overflow-hidden"
              style={{
                backgroundColor: answer === opt ? '#f5f0e8' : '#fff',
                border: `2px solid ${answer === opt ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                boxShadow: answer === opt ? '0 0 0 2px #c3b29e, 0 2px 8px rgba(195,178,158,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'scale(1)' : 'scale(0.95)',
                transition: `all 0.35s cubic-bezier(0.4,0,0.2,1) ${0.15 + i * 0.05}s`,
              }}>
              <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0"
                style={{ border: `2px solid ${answer === opt ? '#0C2631' : '#d1d5db'}`, backgroundColor: answer === opt ? '#0C2631' : 'transparent', transition: 'all 0.25s ease' }}>
                {answer === opt && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
              </div>
              <span className="font-medium text-[15px]" style={{ color: '#101010' }}>{opt === 'yes' ? 'Yes' : 'No'}</span>
            </button>
          ))}
        </div>

        {answer === 'yes' && (
          <div className="w-full mt-2" style={{ animation: 'wmSlideDown 0.3s ease-out' }}>
            <style>{`@keyframes wmSlideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>

            {/* Selected medications */}
            {selectedMeds.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedMeds.map((med) => (
                  <div key={med} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium"
                    style={{ backgroundColor: '#f5f0e8', border: '1px solid #c3b29e', color: '#101010' }}>
                    <span className="max-w-[200px] truncate">{med}</span>
                    <button onClick={() => removeMed(med)} className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors" aria-label={`Remove ${med}`}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
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
                placeholder="Search medications..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => { if (search.trim()) setShowDropdown(true); }}
                onKeyDown={handleKeyDown}
              />

              {/* Dropdown */}
              {showDropdown && search.trim().length > 0 && (
                <div ref={dropdownRef} className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-2xl shadow-lg border overflow-hidden"
                  style={{ borderColor: 'rgba(53,28,12,0.12)', maxHeight: 320 }}>
                  <div className="overflow-y-auto" style={{ maxHeight: 320, WebkitOverflowScrolling: 'touch' }}>
                    {filtered.map((med) => (
                      <button key={med.id} type="button" onClick={() => addMed(med.display)}
                        className="w-full text-left px-5 py-3.5 text-base transition-colors hover:bg-gray-50 border-b"
                        style={{ borderColor: 'rgba(0,0,0,0.04)', color: '#101010' }}>
                        <span className="font-medium">{med.name}</span>
                        {med.display !== med.name && (
                          <span className="text-sm ml-1" style={{ color: '#7B95A9' }}>{med.display.replace(med.name, '').trim()}</span>
                        )}
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <button type="button" onClick={() => addMed(search.trim())}
                        className="w-full text-left px-5 py-3.5 text-base transition-colors hover:bg-gray-50"
                        style={{ color: '#101010' }}>
                        <span className="font-medium">Add &ldquo;{search.trim()}&rdquo;</span>
                        <span className="text-sm ml-1" style={{ color: '#7B95A9' }}>(custom)</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs mt-2" style={{ color: '#999' }}>
              Search and add each medication. Type a name and press Enter if not found.
            </p>
          </div>
        )}
      </div>

      {answer === 'yes' && (
        <div className="w-full max-w-[600px] sm:max-w-[31rem] mx-auto px-6 sm:px-8 pb-6">
          <button onClick={handleContinue}
            className="wm-next-btn w-full flex items-center justify-center gap-4 text-white text-base sm:text-[1.125rem] font-normal rounded-full active:scale-[0.98]"
            style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}>
            Next <span aria-hidden="true">&#10132;</span>
          </button>
        </div>
      )}
    </div>
  );
}
