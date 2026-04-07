'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions } from '../../../../store/intakeStore';

interface WmTestimonialStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  quote: string;
  personName: string;
  lostAmount: string;
  beforeImage: string;
  afterImage: string;
}

export default function WmTestimonialStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  quote,
  personName,
  lostAmount,
  beforeImage,
  afterImage,
}: WmTestimonialStepProps) {
  const router = useRouter();
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  const handleContinue = () => {
    markStepCompleted(`testimonial-${personName}`);
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
        <div className="px-5 sm:px-8 pt-4 max-w-[520px] mx-auto w-full">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-black/5 active:scale-95 transition-all" aria-label="Go back">
            <svg className="w-5 h-5" style={{ color: '#101010' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
      )}

      <div className="flex flex-col items-center w-full max-w-[520px] mx-auto px-6 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 sm:h-8 mt-8 sm:mt-12 mb-6 sm:mb-8"
          style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' }} />

        <h2 className="text-[1.25rem] sm:text-[1.5rem] font-bold text-center mb-6 leading-tight"
          style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s' }}>
          &ldquo;{quote}&rdquo;
        </h2>

        <div className="grid grid-cols-2 gap-3 w-full mb-4"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'scale(1)' : 'scale(0.97)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.2s' }}>
          <div className="relative rounded-xl overflow-hidden aspect-[3/4]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={beforeImage} alt={`${personName} before`} className="w-full h-full object-cover" />
            <div className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded">BEFORE</div>
          </div>
          <div className="relative rounded-xl overflow-hidden aspect-[3/4]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={afterImage} alt={`${personName} after`} className="w-full h-full object-cover" />
            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded">AFTER</div>
          </div>
        </div>

        <p className="text-center text-base" style={{ color: '#101010', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}>
          {personName} is currently <em>down</em> <strong>{lostAmount}</strong> and feeling <strong>amazing</strong>!
        </p>
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
