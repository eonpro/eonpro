'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface RadioOption {
  id: string;
  label: string;
}

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
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  headerText,
  headerItalic,
  question,
  storageKey,
  options,
}: WmMotivationRadioStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [selected, setSelected] = useState<string>(String(responses[storageKey] || ''));

  const handleContinue = () => {
    if (!selected) return;
    setResponse(storageKey, selected);
    markStepCompleted(storageKey);
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

        {(headerText || headerItalic) && (
          <h1 className="text-[1.25rem] sm:text-[1.75rem] font-bold text-center leading-tight mb-4" style={{ color: '#101010' }}>
            {headerText}
            {headerItalic && <>{' '}<span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>{headerItalic}</span></>}
          </h1>
        )}

        <h2 className="text-[1.125rem] sm:text-[1.375rem] font-bold text-center mb-6" style={{ color: '#101010' }}>
          {question}
          <span className="ml-1" style={{ color: '#7B95A9' }}>*</span>
        </h2>

        <div className="w-full space-y-3">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border-2 bg-white transition-all text-left"
              style={{
                borderColor: selected === opt.id ? 'var(--intake-accent, #7B95A9)' : '#e5e7eb',
              }}
            >
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: selected === opt.id ? 'var(--intake-accent, #7B95A9)' : '#d1d5db' }}>
                {selected === opt.id && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#c3b29e' }} />}
              </div>
              <span className="font-medium text-base" style={{ color: '#101010' }}>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={!selected}
          className="w-full flex items-center justify-center gap-3 py-4 text-white font-medium text-base rounded-full active:scale-[0.98] transition-all duration-200 disabled:opacity-40"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
