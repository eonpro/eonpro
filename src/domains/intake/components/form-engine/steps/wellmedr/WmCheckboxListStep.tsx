'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface CheckboxOption { id: string; label: string; }

interface WmCheckboxListStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  headerItalic?: string;
  headerText?: string;
  subtitleText?: string;
  question: string;
  storageKey: string;
  options: CheckboxOption[];
  noneOptionId?: string;
}

export default function WmCheckboxListStep({
  basePath, nextStep, progressPercent,
  headerItalic, headerText, subtitleText, question,
  storageKey, options, noneOptionId = 'none',
}: WmCheckboxListStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  const [selected, setSelected] = useState<string[]>(
    Array.isArray(responses[storageKey]) ? (responses[storageKey] as string[]) : []
  );

  const handleToggle = (id: string) => {
    if (id === noneOptionId) { setSelected(selected.includes(noneOptionId) ? [] : [noneOptionId]); return; }
    const withoutNone = selected.filter((s) => s !== noneOptionId);
    setSelected(withoutNone.includes(id) ? withoutNone.filter((s) => s !== id) : [...withoutNone, id]);
  };

  const handleContinue = () => {
    if (selected.length === 0) return;
    setResponse(storageKey, selected);
    markStepCompleted(storageKey);
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 pt-6 sm:pt-8 pb-4 max-w-md sm:max-w-lg mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8"
          style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' }} />

        {(headerItalic || headerText) && (
          <div className="text-center mb-3" style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.05s' }}>
            {headerItalic && <p className="italic text-lg sm:text-xl mb-1" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>{headerItalic}</p>}
            {headerText && <p className="text-[15px] sm:text-lg font-bold" style={{ color: '#101010' }}>{headerText}</p>}
          </div>
        )}

        {subtitleText && <p className="text-xs sm:text-sm text-center mb-3" style={{ color: '#888', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.15s' }}>{subtitleText}</p>}

        <h2 className="text-lg sm:text-[1.4rem] font-bold text-center mb-5"
          style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s' }}>
          {question}<span className="ml-1" style={{ color: '#c3b29e' }}>*</span>
        </h2>

        <div className="w-full space-y-2">
          {options.map((opt, i) => {
            const sel = selected.includes(opt.id);
            return (
              <button key={opt.id} onClick={() => handleToggle(opt.id)}
                className="w-full flex items-start gap-3 px-4 py-3.5 rounded-[14px] text-left"
                style={{
                  backgroundColor: sel ? '#f5f0e8' : '#fff',
                  border: `1.5px solid ${sel ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                  boxShadow: sel ? '0 0 0 1px #c3b29e' : '0 1px 2px rgba(0,0,0,0.03)',
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateX(0)' : 'translateX(-8px)',
                  transition: `all 0.3s cubic-bezier(0.4,0,0.2,1) ${Math.min(i * 0.02, 0.3)}s`,
                }}>
                <div className="w-5 h-5 mt-0.5 rounded flex items-center justify-center shrink-0"
                  style={{ border: `2px solid ${sel ? '#c3b29e' : '#d1d5db'}`, backgroundColor: sel ? '#c3b29e' : 'transparent', borderRadius: '5px', transition: 'all 0.2s ease' }}>
                  {sel && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="text-[14px] sm:text-[15px] leading-snug" style={{ color: '#101010' }}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-md sm:max-w-lg mx-auto w-full" style={{ backgroundColor: '#F7F7F9' }}>
        <button onClick={handleContinue} disabled={selected.length === 0}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-white font-medium text-base rounded-full disabled:opacity-30 active:scale-[0.98]"
          style={{ backgroundColor: '#0C2631', transition: 'all 0.3s ease' }}>
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
