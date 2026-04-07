'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface RadioOption { id: string; label: string; }

interface WmMotivationRadioStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  headerText?: string;
  headerItalic?: string;
  question: string;
  storageKey: string;
  options: RadioOption[];
}

export default function WmMotivationRadioStep({
  basePath, nextStep, prevStep, progressPercent,
  headerText, headerItalic, question, storageKey, options,
}: WmMotivationRadioStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);
  const fadeInStyle = { opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' };

  const handleBack = () => {
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
  };

  const [selected, setSelected] = useState<string>(String(responses[storageKey] || ''));

  const handleSelect = (id: string) => {
    setSelected(id);
    setResponse(storageKey, id);
    markStepCompleted(storageKey);
    setTimeout(() => { setCurrentStep(nextStep); router.push(`${basePath}/${nextStep}`); }, 300);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      {prevStep && (
        <div className="w-full max-w-[600px] mx-auto px-6 sm:px-8 pt-3">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-black/5 active:scale-95 transition-all" aria-label="Go back">
            <svg className="w-5 h-5" style={{ color: '#101010' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
      )}

      <div className="w-full max-w-[600px] mx-auto px-6 sm:px-8 pt-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 sm:h-8" style={fadeInStyle} />
      </div>

      <div className="flex flex-1 flex-col justify-center w-full max-w-[600px] mx-auto px-6 sm:px-8 pb-6">
        {(headerText || headerItalic) && (
          <h1 className="text-xl sm:text-[1.75rem] font-bold text-center leading-snug mb-4"
            style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.05s' }}>
            {headerText}
            {headerItalic && <>{' '}<span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>{headerItalic}</span></>}
          </h1>
        )}

        <h2 className="text-lg sm:text-[1.35rem] font-bold text-center mb-6"
          style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s' }}>
          {question}<span className="ml-1" style={{ color: '#c3b29e' }}>*</span>
        </h2>

        <div className="w-full space-y-3">
          {options.map((opt, i) => {
            const sel = selected === opt.id;
            return (
              <button key={opt.id} onClick={() => handleSelect(opt.id)}
                className="w-full flex items-center gap-3 px-5 py-4 rounded-[18px] text-left"
                style={{
                  backgroundColor: sel ? '#f5f0e8' : '#fff',
                  border: `2px solid ${sel ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                  boxShadow: sel ? '0 0 0 2px #c3b29e, 0 2px 8px rgba(195,178,158,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                  transition: `all 0.35s cubic-bezier(0.4,0,0.2,1) ${0.12 + i * 0.04}s`,
                }}>
                <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0"
                  style={{ border: `2px solid ${sel ? '#c3b29e' : '#d1d5db'}`, backgroundColor: sel ? '#c3b29e' : 'transparent', transition: 'all 0.25s ease' }}>
                  {sel && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="font-medium text-[15px]" style={{ color: '#101010' }}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
