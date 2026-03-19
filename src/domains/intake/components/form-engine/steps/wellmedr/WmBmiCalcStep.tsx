'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmBmiCalcStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmBmiCalcStep({
  basePath,
  nextStep,
  progressPercent,
}: WmBmiCalcStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [feet, setFeet] = useState(String(responses.height_feet || responses.heightFeet || ''));
  const [inches, setInches] = useState(String(responses.height_inches ?? responses.heightInches ?? ''));
  const [weight, setWeight] = useState(String(responses.current_weight || responses.currentWeight || ''));

  const handleContinue = () => {
    if (!weight || !feet) return;
    setResponse('current_weight', weight);
    setResponse('currentWeight', weight);
    setResponse('height_feet', feet);
    setResponse('heightFeet', feet);
    setResponse('height_inches', inches || '0');
    setResponse('heightInches', inches || '0');
    markStepCompleted('bmi-calc');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '64px',
    padding: '0 1.5rem',
    fontSize: '1rem',
    fontWeight: 500,
    color: '#101010',
    backgroundColor: '#ffffff',
    border: '1px solid rgba(53, 28, 12, 0.12)',
    borderRadius: '20px',
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    paddingRight: '3rem',
    cursor: 'pointer',
  };

  const handleFocus = (e: React.FocusEvent<HTMLSelectElement | HTMLInputElement>) => {
    e.target.style.borderColor = '#c3b29e';
    e.target.style.boxShadow = '0 0 0 2px rgba(195,178,158,0.3)';
  };
  const handleBlur = (e: React.FocusEvent<HTMLSelectElement | HTMLInputElement>) => {
    e.target.style.borderColor = 'rgba(53,28,12,0.12)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-300" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 mb-10" />

        <h1 className="text-[1.5rem] sm:text-[2rem] font-bold text-center leading-tight mb-3" style={{ color: '#101010' }}>
          Let&rsquo;s calculate your BMI.
        </h1>
        <p className="text-center text-sm sm:text-base mb-8" style={{ color: '#555' }}>
          Body Mass Index (BMI) helps determine eligibility for weight loss medication and assess weight-related health risks.
        </p>

        <div className="w-full space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold mb-1.5" style={{ color: '#101010' }}>
                Feet <span style={{ color: '#c3b29e' }}>*</span>
              </label>
              <div className="relative">
                <select value={feet} onChange={(e) => setFeet(e.target.value)} style={selectStyle} onFocus={handleFocus} onBlur={handleBlur}>
                  <option value="" disabled>Select</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4" style={{ color: '#999' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5" style={{ color: '#101010' }}>Inches</label>
              <div className="relative">
                <select value={inches} onChange={(e) => setInches(e.target.value)} style={selectStyle} onFocus={handleFocus} onBlur={handleBlur}>
                  <option value="" disabled>Select</option>
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i)}>{i}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4" style={{ color: '#999' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5" style={{ color: '#101010' }}>
              Weight (lbs) <span style={{ color: '#c3b29e' }}>*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="200"
              value={weight}
              onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ''))}
              style={inputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 pb-8 max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={!weight || !feet}
          className="w-full flex items-center justify-center gap-3 py-4 px-8 text-white font-medium rounded-full transition-all duration-200 disabled:opacity-40"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
