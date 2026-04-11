'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmGlp1TypeStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmGlp1TypeStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmGlp1TypeStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const handleBack = () => {
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
  };

  const [selected, setSelected] = useState(String(responses.glp1_type || ''));
  const [otherName, setOtherName] = useState(String(responses.glp1_type_other || ''));

  const options = [
    { id: 'semaglutide', label: 'Semaglutide (Ozempic / Wegovy compound equivalent)' },
    { id: 'tirzepatide', label: 'Tirzepatide (Mounjaro / Zepbound compound equivalent)' },
    { id: 'other', label: 'Other' },
  ];

  const handleContinue = () => {
    if (!selected) return;
    setResponse('glp1_type', selected);
    if (selected === 'other' && otherName) {
      setResponse('glp1_type_other', otherName);
    }
    markStepCompleted('glp1-type-wm');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full" style={{ padding: '1.5rem 1.5rem 0' }}>
        <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'rgba(53, 28, 12, 0.06)', maxWidth: '48rem', marginInline: 'auto' }}>
          <div className="h-full rounded-full" style={{ width: `${progressPercent}%`, background: 'linear-gradient(90deg, #41362a, #6a5b4b, #8f7e6a, #c3b29e)', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
        </div>
      </div>

      <div className="w-full max-w-[48rem] mx-auto px-6 pt-4 grid grid-cols-3 items-center">
        <div>
          {prevStep && (
            <button onClick={handleBack} className="p-1 rounded-lg hover:bg-black/5 active:scale-95 transition-all" aria-label="Go back">
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

      <div className="flex-1 flex flex-col justify-center w-full max-w-[600px] mx-auto px-6 sm:px-8 pb-6">
        <h1 className="text-[1.25rem] sm:text-[1.5rem] font-bold text-center mb-2" style={{ color: '#101010' }}>
          Great! You have experience with<br />
          <span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>weight loss medication.</span>
        </h1>

        <h2 className="text-[1.125rem] sm:text-[1.375rem] font-bold text-center mb-6" style={{ color: '#101010' }}>
          Which weight loss medication have you taken?
          <span className="ml-1" style={{ color: '#7B95A9' }}>*</span>
        </h2>

        <div className="w-full space-y-3 mb-4">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-3xl border-2 bg-white transition-all text-left"
              style={{ borderColor: selected === opt.id ? 'var(--intake-accent, #7B95A9)' : '#e5e7eb' }}
            >
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: selected === opt.id ? 'var(--intake-accent, #7B95A9)' : '#d1d5db' }}>
                {selected === opt.id && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#c3b29e' }} />}
              </div>
              <span className="text-sm sm:text-base">{opt.label}</span>
            </button>
          ))}
        </div>

        {selected === 'other' && (
          <div className="w-full p-4 rounded-2xl" style={{ backgroundColor: '#eef2f5' }}>
            <label className="block text-sm font-medium mb-2" style={{ color: '#666' }}>
              Please specify the medication name.
              <span className="ml-1" style={{ color: '#7B95A9' }}>*</span>
            </label>
            <textarea
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              rows={3}
              className="w-full p-4 rounded-xl border bg-white resize-y text-base focus:outline-none"
              style={{ borderColor: 'rgba(0,0,0,0.08)', transition: 'border-color 0.2s' }}
              onFocus={(e) => { e.target.style.borderColor = '#c3b29e'; e.target.style.boxShadow = '0 0 0 3px rgba(195,178,158,0.15)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(0,0,0,0.08)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        )}
      </div>

      <div className="w-full max-w-[600px] mx-auto px-6 sm:px-8 pb-8 sm:max-w-[31rem] sm:mx-auto">
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-4 py-[18px] text-white font-normal text-base sm:text-[1.125rem] rounded-full active:scale-[0.98]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Next <span className="text-base" aria-hidden>&#10132;</span>
        </button>
      </div>
    </div>
  );
}
