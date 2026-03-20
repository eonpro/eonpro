'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

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

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      {prevStep && (
        <div className="px-5 sm:px-8 pt-4 max-w-xl sm:max-w-2xl mx-auto w-full">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-black/5 active:scale-95 transition-all">
            <svg className="w-5 h-5" style={{ color: '#101010' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center px-5 sm:px-8 pt-4 sm:pt-6 pb-4 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

        {w > 0 && (
          <p className="text-center text-sm sm:text-base mb-2" style={{ color: '#666' }}>
            Perfect! With a BMI of <span className="font-semibold" style={{ color: '#7B95A9' }}>{bmi}</span>, we can continue.
          </p>
        )}

        <h1 className="text-xl sm:text-[1.75rem] font-bold text-center mb-0.5" style={{ color: '#101010' }}>
          We&rsquo;re in this together.
        </h1>
        <p className="text-lg sm:text-xl italic text-center mb-4" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>
          Your goal is our goal.
        </p>

        <h2 className="text-lg sm:text-[1.4rem] font-bold text-center mb-4 sm:mb-6" style={{ color: '#101010' }}>
          What is your goal weight?
        </h2>

        <div className="w-full">
          <label className="block text-sm font-semibold mb-1.5" style={{ color: '#101010' }}>
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
            style={{
              height: '56px', padding: '0 1.25rem', fontSize: '1rem', fontWeight: 500,
              color: '#101010', backgroundColor: '#fff', border: '1px solid rgba(53,28,12,0.1)',
              borderRadius: '16px', outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = '#c3b29e'; e.target.style.boxShadow = '0 0 0 3px rgba(195,178,158,0.2)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(53,28,12,0.1)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full" style={{ backgroundColor: '#F7F7F9' }}>
        <button
          onClick={handleContinue}
          disabled={!weight}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-white font-medium text-base rounded-full transition-all duration-200 disabled:opacity-30 active:scale-[0.98]"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
