'use client';

import { useState, useEffect } from 'react';
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
  const [dose, setDose] = useState(String(responses.glp1_dose || ''));
  const [otherName, setOtherName] = useState(String(responses.glp1_type_other || ''));
  const [otherDose, setOtherDose] = useState(String(responses.glp1_dose_other || ''));

  const options = [
    { id: 'semaglutide', label: 'Semaglutide (Ozempic / Wegovy compound equivalent)' },
    { id: 'tirzepatide', label: 'Tirzepatide (Mounjaro / Zepbound compound equivalent)' },
    { id: 'other', label: 'Other' },
  ];

  const semaDoses = ['0.25', '0.5', '1.0', '1.7', '2.4'];
  const tirzDoses = ['2.5', '5', '7.5', '10', '12.5', '15'];

  const handleContinue = () => {
    if (!selected) return;
    if (selected === 'semaglutide' && !dose) return;
    if (selected === 'tirzepatide' && !dose) return;
    if (selected === 'other' && !otherName.trim()) return;
    setResponse('glp1_type', selected);
    if (dose) setResponse('glp1_dose', dose);
    if (selected === 'other') {
      setResponse('glp1_type_other', otherName);
      if (otherDose) setResponse('glp1_dose_other', otherDose);
    }
    markStepCompleted('glp1-type-wm');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) handleContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .wm-input:focus {
          border-color: #7b95a9;
          box-shadow: 0 0 0 2px #7b95a9;
        }
        .wm-input::placeholder {
          opacity: 0.3; color: #101010; font-weight: 400;
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

        {/* Dose selection for Semaglutide / Tirzepatide */}
        {(selected === 'semaglutide' || selected === 'tirzepatide') && (
          <div className="w-full mt-2">
            <h3 className="text-[1.125rem] sm:text-[1.25rem] font-bold text-center mb-4" style={{ color: '#101010' }}>
              What dose were you most recently taking?
            </h3>
            <div className="w-full space-y-3">
              {(selected === 'semaglutide' ? semaDoses : tirzDoses).map((d) => (
                <button
                  key={d}
                  onClick={() => setDose(d)}
                  className="w-full flex items-center gap-3 px-5 py-4 rounded-3xl border-2 bg-white transition-all text-left"
                  style={{ borderColor: dose === d ? '#0C2631' : 'rgba(0,0,0,0.06)' }}
                >
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: dose === d ? '#0C2631' : '#d1d5db' }}>
                    {dose === d && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#0C2631' }} />}
                  </div>
                  <span className="text-base font-medium">{d}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Other: medication name + dose text fields */}
        {selected === 'other' && (
          <div className="w-full space-y-4 mt-2">
            <div>
              <label className="block text-base font-medium mb-2" style={{ color: '#101010' }}>
                Please specify the medication name.
              </label>
              <input
                type="text"
                value={otherName}
                onChange={(e) => setOtherName(e.target.value)}
                placeholder="Medication name"
                className="wm-input"
              />
            </div>
            <div>
              <label className="block text-base font-medium mb-2" style={{ color: '#101010' }}>
                What dose were you most recently taking?
              </label>
              <input
                type="text"
                value={otherDose}
                onChange={(e) => setOtherDose(e.target.value)}
                placeholder="Dose"
                className="wm-input"
              />
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-[600px] mx-auto px-6 sm:px-8 pb-8 sm:max-w-[31rem] sm:mx-auto">
        <button
          onClick={handleContinue}
          className="w-full wm-next-btn flex items-center justify-center gap-4 py-[18px] text-white font-normal text-base sm:text-[1.125rem] rounded-full active:scale-[0.98]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Next <span className="text-base" aria-hidden>&#10132;</span>
        </button>
      </div>
    </div>
  );
}
