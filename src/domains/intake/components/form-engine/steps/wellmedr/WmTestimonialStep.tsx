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
  combinedImage?: string;
  descriptionHtml?: string;
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
  combinedImage,
  descriptionHtml,
}: WmTestimonialStepProps) {
  const router = useRouter();
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);
  const fadeInStyle = { opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' };

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
      <div className="w-full h-[3px]" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>

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

      <div className="flex flex-1 flex-col justify-center w-full max-w-[600px] mx-auto px-6 sm:px-8 pb-6">
        <h2 className="text-[1.25rem] sm:text-[1.5rem] font-bold text-center mb-6 leading-tight"
          style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s' }}>
          &ldquo;{quote}&rdquo;
        </h2>

        {combinedImage ? (
          <div className="w-full mb-4 rounded-xl overflow-hidden"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'scale(1)' : 'scale(0.97)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.2s' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={combinedImage} alt={`${personName} before and after`} className="w-full h-auto object-cover rounded-xl" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 w-full mb-4"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'scale(1)' : 'scale(0.97)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.2s' }}>
            <div className="relative rounded-xl overflow-hidden aspect-[3/4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={beforeImage} alt={`${personName} before`} className="w-full h-full object-cover" />
            </div>
            <div className="relative rounded-xl overflow-hidden aspect-[3/4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={afterImage} alt={`${personName} after`} className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        {descriptionHtml ? (
          <p className="text-center text-base" style={{ color: '#101010', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}
            dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
        ) : (
          <p className="text-center text-base" style={{ color: '#101010', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}>
            {personName} is currently <em>down</em> <strong>{lostAmount}</strong> and feeling <strong>amazing</strong>!
          </p>
        )}
      </div>

      <div className="w-full max-w-[600px] sm:max-w-[31rem] mx-auto sm:mx-auto px-6 sm:px-8 pb-6">
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-4 py-[18px] text-white font-normal text-base sm:text-[1.125rem] rounded-full active:scale-[0.98]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Next <span className="text-lg" aria-hidden="true">&#10132;</span>
        </button>
      </div>
    </div>
  );
}
