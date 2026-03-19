'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface CheckboxOption {
  id: string;
  label: string;
}

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
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  headerItalic,
  headerText,
  subtitleText,
  question,
  storageKey,
  options,
  noneOptionId = 'none',
}: WmCheckboxListStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [selected, setSelected] = useState<string[]>(
    Array.isArray(responses[storageKey]) ? (responses[storageKey] as string[]) : []
  );

  const handleToggle = (id: string) => {
    if (id === noneOptionId) {
      setSelected(selected.includes(noneOptionId) ? [] : [noneOptionId]);
      return;
    }
    const withoutNone = selected.filter((s) => s !== noneOptionId);
    const next = withoutNone.includes(id) ? withoutNone.filter((s) => s !== id) : [...withoutNone, id];
    setSelected(next);
  };

  const handleContinue = () => {
    if (selected.length === 0) return;
    setResponse(storageKey, selected);
    markStepCompleted(storageKey);
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-300" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 mb-8" />

        {(headerItalic || headerText) && (
          <div className="text-center mb-4">
            {headerItalic && (
              <p className="italic text-lg sm:text-xl mb-1" style={{ color: '#7B95A9', fontFamily: 'var(--font-bodoni, serif)' }}>{headerItalic}</p>
            )}
            {headerText && (
              <p className="text-base sm:text-lg font-bold" style={{ color: '#101010' }}>{headerText}</p>
            )}
          </div>
        )}

        {subtitleText && (
          <p className="text-sm text-center mb-4" style={{ color: '#888' }}>{subtitleText}</p>
        )}

        <h2 className="text-[1.25rem] sm:text-[1.5rem] font-bold text-center mb-6" style={{ color: '#101010' }}>
          {question}
          <span className="ml-1" style={{ color: '#7B95A9' }}>*</span>
        </h2>

        <div className="w-full space-y-2.5">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleToggle(opt.id)}
              className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border bg-white transition-all text-left"
              style={{
                borderColor: selected.includes(opt.id) ? 'var(--intake-accent, #7B95A9)' : '#e5e7eb',
              }}
            >
              <div className="w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0" style={{ borderColor: selected.includes(opt.id) ? 'var(--intake-accent, #7B95A9)' : '#d1d5db', backgroundColor: selected.includes(opt.id) ? 'var(--intake-accent, #7B95A9)' : 'transparent' }}>
                {selected.includes(opt.id) && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span className="text-sm sm:text-base" style={{ color: '#101010' }}>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 lg:px-8 pb-8 max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={selected.length === 0}
          className="w-full flex items-center justify-center gap-3 py-4 px-8 text-white font-medium rounded-full transition-all duration-200 disabled:opacity-40"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
