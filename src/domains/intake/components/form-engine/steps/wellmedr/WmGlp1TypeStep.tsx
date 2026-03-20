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
  progressPercent,
}: WmGlp1TypeStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

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
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 lg:px-8 pt-8 pb-6 max-w-md sm:max-w-lg mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

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
              className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border-2 bg-white transition-all text-left"
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
              className="w-full p-4 rounded-xl border border-gray-200 bg-white resize-y text-base focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-md sm:max-w-lg mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={!selected || (selected === 'other' && !otherName.trim())}
          className="w-full flex items-center justify-center gap-3 py-4 text-white font-medium text-base rounded-full active:scale-[0.98] transition-all disabled:opacity-40"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
