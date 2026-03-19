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

export default function WmBmiCalcStep({ basePath, nextStep, progressPercent }: WmBmiCalcStepProps) {
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

  const inputBase: React.CSSProperties = {
    width: '100%', height: '56px', padding: '0 1.25rem',
    fontSize: '1rem', fontWeight: 500, color: '#101010',
    backgroundColor: '#ffffff', border: '1px solid rgba(53,28,12,0.1)',
    borderRadius: '16px', outline: 'none',
  };
  const selectBase: React.CSSProperties = { ...inputBase, appearance: 'none', paddingRight: '2.5rem', cursor: 'pointer' };

  const onFocus = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = '#c3b29e';
    (e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(195,178,158,0.2)';
  };
  const onBlur = (e: React.FocusEvent<HTMLElement>) => {
    (e.target as HTMLElement).style.borderColor = 'rgba(53,28,12,0.1)';
    (e.target as HTMLElement).style.boxShadow = 'none';
  };

  const chevron = (
    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-5 sm:px-8 pt-6 sm:pt-8 pb-4 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-8 sm:mb-10" />

        <h1 className="text-[1.4rem] sm:text-[2rem] font-bold text-center leading-tight mb-2 sm:mb-3" style={{ color: '#101010' }}>
          Let&rsquo;s calculate your BMI.
        </h1>
        <p className="text-center text-[13px] sm:text-base mb-6 sm:mb-8 px-2" style={{ color: '#666' }}>
          Body Mass Index (BMI) helps determine eligibility for weight loss medication and assess weight-related health risks.
        </p>

        <div className="w-full space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: '#101010' }}>Feet <span style={{ color: '#c3b29e' }}>*</span></label>
              <div className="relative">
                <select value={feet} onChange={(e) => setFeet(e.target.value)} style={selectBase} onFocus={onFocus} onBlur={onBlur}>
                  <option value="" disabled>Select</option>
                  <option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option>
                </select>
                {chevron}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: '#101010' }}>Inches</label>
              <div className="relative">
                <select value={inches} onChange={(e) => setInches(e.target.value)} style={selectBase} onFocus={onFocus} onBlur={onBlur}>
                  <option value="" disabled>Select</option>
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i)}>{i}</option>)}
                </select>
                {chevron}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: '#101010' }}>Weight (lbs) <span style={{ color: '#c3b29e' }}>*</span></label>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*" placeholder="200"
              value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ''))}
              style={inputBase} onFocus={onFocus} onBlur={onBlur}
            />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full" style={{ backgroundColor: '#F7F7F9' }}>
        <button
          onClick={handleContinue} disabled={!weight || !feet}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-white font-medium text-base rounded-full transition-all duration-200 disabled:opacity-30 active:scale-[0.98]"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
