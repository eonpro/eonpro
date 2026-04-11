'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 64,
  padding: '0 2rem',
  fontSize: '1rem',
  fontWeight: 500,
  color: '#101010',
  backgroundColor: '#fff',
  border: '1px solid rgba(53, 28, 12, 0.12)',
  borderRadius: 20,
  outline: 'none',
  letterSpacing: '-0.01em',
  lineHeight: '1.5rem',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

interface WmGoalWeightStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmGoalWeightStep({ basePath, nextStep, prevStep, progressPercent }: WmGoalWeightStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [weight, setWeight] = useState(String(responses.ideal_weight || responses.idealWeight || ''));

  const w = Number(responses.current_weight || responses.currentWeight) || 0;
  const ft = Number(responses.height_feet || responses.heightFeet) || 5;
  const inc = Number(responses.height_inches ?? responses.heightInches ?? 4);
  const totalIn = ft * 12 + inc;
  const bmi = totalIn > 0 ? ((w / (totalIn * totalIn)) * 703).toFixed(1) : '0';

  const handleContinue = () => {
    if (!weight) return;
    setResponse('ideal_weight', weight);
    setResponse('idealWeight', weight);
    markStepCompleted('goal-weight');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleBack = () => {
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
  };

  const onInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#7b95a9';
    e.target.style.boxShadow = '0 0 0 2px #7b95a9';
  };
  const onInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'rgba(53, 28, 12, 0.12)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      {/* Progress bar */}
      <div className="w-full h-[3px]" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

      {/* Back + Logo */}
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

      <div className="flex-1 flex flex-col justify-center max-w-[600px] mx-auto px-6 sm:px-8 pb-6 w-full space-y-5">
        {w > 0 && (
          <p className="text-[15px] text-center" style={{ color: '#666' }}>
            Perfect! With a BMI of <span className="font-semibold" style={{ color: '#7B95A9' }}>{bmi}</span>, we can continue.
          </p>
        )}

        <h1 className="text-[1.55rem] sm:text-[1.75rem] font-bold text-center" style={{ color: '#101010' }}>
          We&rsquo;re in this together.
        </h1>
        <p className="text-[15px] text-center" style={{ color: '#666' }}>
          Your goal is our goal.
        </p>

        <h2 className="text-lg sm:text-[1.4rem] font-bold text-center" style={{ color: '#101010' }}>
          What is your goal weight?
        </h2>

        <div className="w-full">
          <label className="block text-base sm:text-[1.125rem] font-medium mb-2" style={{ color: '#101010', letterSpacing: '-0.01em' }}>
            Your goal weight (lbs) <span style={{ color: '#c3b29e' }}>*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="150"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full"
            style={inputStyle}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />
        </div>
      </div>

      <div className="w-full max-w-[600px] mx-auto px-6 sm:px-8 mt-8 pb-6 sm:max-w-[31rem] sm:mx-auto" style={{ backgroundColor: '#F7F7F9' }}>
        <button
          type="button"
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-4 py-[18px] text-white font-normal text-base sm:text-[1.125rem] rounded-full active:scale-[0.98]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Next <span aria-hidden="true">&#10132;</span>
        </button>
      </div>
    </div>
  );
}
