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
  progressPercent,
}: WmPatternInfoStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { markStepCompleted, setCurrentStep } = useIntakeActions();

  const weight = Number(responses.current_weight) || 200;
  const goalWeight = Number(responses.ideal_weight) || 150;
  const lbsToLose = weight - goalWeight;

  const handleContinue = () => {
    markStepCompleted('pattern-info');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-300" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 lg:px-8 pt-8 pb-6 max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 mb-8" />

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

      <div className="px-6 lg:px-8 pb-8 max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-3 py-4 px-8 text-white font-medium rounded-full"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
