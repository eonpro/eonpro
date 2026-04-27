'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmPatternInfoStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmPatternInfoStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmPatternInfoStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { markStepCompleted, setCurrentStep } = useIntakeActions();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const weight = Number(responses.current_weight) || 200;
  const goalWeight = Number(responses.ideal_weight) || 150;
  const lbsToLose = weight - goalWeight;

  const handleContinue = () => {
    markStepCompleted('pattern-info');
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

      <div className="mx-auto grid w-full max-w-[48rem] grid-cols-3 items-center px-6 pt-4">
        <div />
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      <div
        className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center px-6 pb-6 sm:px-8"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(8px)',
          transition:
            'opacity 0.45s cubic-bezier(0.16,1,0.3,1), transform 0.45s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div
          className="flex min-h-[50vh] w-full flex-col items-center justify-center rounded-2xl p-8 text-center text-white sm:p-12"
          style={{
            backgroundColor: '#8a7d6e',
            backgroundImage: 'url(/assets/patterns/bg-pattern.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <p className="mb-1 text-lg sm:text-xl">
            Perfect! Losing <strong>{lbsToLose} lbs</strong> is easier
          </p>
          <p className="mb-4 text-lg sm:text-xl">
            than you think - and it <em>doesn&apos;t</em>
          </p>
          <p className="mb-6 text-lg italic sm:text-xl">involve restrictive diets.</p>

          <p className="text-base opacity-90 sm:text-lg">
            Now, let&apos;s analyze your
            <br />
            metabolism and discover how well
            <br />
            your body processes macronutrients.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[600px] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-[31rem] sm:px-8">
        <button
          onClick={handleContinue}
          className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full py-[18px] text-base font-normal text-white active:scale-[0.98] sm:text-[1.125rem]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Next{' '}
          <span className="text-base" aria-hidden>
            &#10132;
          </span>
        </button>
      </div>
    </div>
  );
}
