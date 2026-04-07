'use client';

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

  const handleBack = () => {
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
  };

  const weight = Number(responses.current_weight) || 200;
  const goalWeight = Number(responses.ideal_weight) || 150;
  const lbsToLose = weight - goalWeight;

  const handleContinue = () => {
    markStepCompleted('pattern-info');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      {prevStep && (
        <div className="px-5 sm:px-8 pt-4 max-w-[520px] mx-auto w-full">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-black/5 active:scale-95 transition-all" aria-label="Go back">
            <svg className="w-5 h-5" style={{ color: '#101010' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
      )}

      <div className="flex flex-col items-center w-full max-w-[520px] mx-auto px-6 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 sm:h-8 mt-8 sm:mt-12 mb-6 sm:mb-8" />

        <div className="w-full rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-white text-center min-h-[50vh]" style={{ backgroundColor: '#8a7d6e', backgroundImage: 'url(/assets/patterns/bg-pattern.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <p className="text-lg sm:text-xl mb-1">
            Perfect! Losing <strong>{lbsToLose} lbs</strong> is easier
          </p>
          <p className="text-lg sm:text-xl mb-4">
            than you think - and it <em>doesn&apos;t</em>
          </p>
          <p className="text-lg sm:text-xl italic mb-6">involve restrictive diets.</p>

          <p className="text-base sm:text-lg opacity-90">
            Now, let&apos;s analyze your<br />metabolism and discover how well<br />your body processes macronutrients.
          </p>
        </div>
      </div>

      <div className="w-full max-w-[520px] mx-auto px-6 sm:px-8 mt-8 pb-8">
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-3 py-4 text-white font-medium text-base rounded-full active:scale-[0.98]"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
