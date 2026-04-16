'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmGoalWeightStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmGoalWeightStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmGoalWeightStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [weight, setWeight] = useState(
    String(responses.ideal_weight || responses.idealWeight || '')
  );

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

  const handleContinueRef = useRef(handleContinue);
  handleContinueRef.current = handleContinue;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) handleContinueRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: '#F7F7F9' }}>
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
          letter-spacing: -0.01em;
          line-height: 1.5rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .wm-input:focus {
          border-color: #7b95a9;
          box-shadow: 0 0 0 2px #7b95a9;
        }
        .wm-input::placeholder {
          opacity: 0.3; color: #101010; font-weight: 400;
        }
        @media (min-width: 640px) {
          .wm-input { height: 72px; font-size: 1.25rem; }
        }
      `}</style>
      {/* Progress bar */}
      <div className="h-[3px] w-full" style={{ backgroundColor: '#e5e0d8' }}>
        <div
          className="h-full"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: '#c3b29e',
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>

      {/* Back + Logo */}
      <div className="mx-auto grid w-full max-w-[48rem] grid-cols-3 items-center px-6 pt-4">
        <div />
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center space-y-5 px-6 pb-6 sm:px-8">
        {w > 0 && (
          <p className="text-center text-[15px]" style={{ color: '#666' }}>
            Perfect! With a BMI of{' '}
            <span className="font-semibold" style={{ color: '#7B95A9' }}>
              {bmi}
            </span>
            , we can continue.
          </p>
        )}

        <h1
          className="text-center text-[1.55rem] font-bold sm:text-[1.75rem]"
          style={{ color: '#101010' }}
        >
          We&rsquo;re in this together.
        </h1>
        <p className="text-center text-[15px]" style={{ color: '#666' }}>
          Your goal is our goal.
        </p>

        <h2 className="text-center text-lg font-bold sm:text-[1.4rem]" style={{ color: '#101010' }}>
          What is your goal weight?
        </h2>

        <div className="w-full">
          <label
            className="mb-2 block text-base font-medium sm:text-[1.125rem]"
            style={{ color: '#101010', letterSpacing: '-0.01em' }}
          >
            Your goal weight (lbs) <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="150"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ''))}
            className="wm-input"
          />
        </div>
      </div>

      <div
        className="mx-auto mt-8 w-full max-w-[600px] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-[31rem] sm:px-8"
        style={{ backgroundColor: '#F7F7F9' }}
      >
        <button
          type="button"
          onClick={handleContinue}
          className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full py-[18px] text-base font-normal text-white active:scale-[0.98] sm:text-[1.125rem]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Next <span aria-hidden="true">&#10132;</span>
        </button>
      </div>
    </div>
  );
}
