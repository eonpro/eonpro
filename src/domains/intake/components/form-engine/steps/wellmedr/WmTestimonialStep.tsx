'use client';

import { useState, useEffect, useRef } from 'react';
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
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);
  const fadeInStyle = { opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' };

  const handleContinue = () => {
    markStepCompleted(`testimonial-${personName}`);
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

      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center px-6 pb-6 sm:px-8">
        <h2
          className="mb-6 text-center text-[1.25rem] font-bold leading-tight sm:text-[1.5rem]"
          style={{
            color: '#101010',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(10px)',
            transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s',
          }}
        >
          &ldquo;{quote}&rdquo;
        </h2>

        {combinedImage ? (
          <div
            className="mb-4 w-full overflow-hidden rounded-xl"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'scale(1)' : 'scale(0.97)',
              transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.2s',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={combinedImage}
              alt={`${personName} before and after`}
              className="h-auto w-full rounded-xl object-cover"
            />
          </div>
        ) : (
          <div
            className="mb-4 grid w-full grid-cols-2 gap-3"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'scale(1)' : 'scale(0.97)',
              transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.2s',
            }}
          >
            <div className="relative aspect-[3/4] overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={beforeImage}
                alt={`${personName} before`}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="relative aspect-[3/4] overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={afterImage}
                alt={`${personName} after`}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        )}

        {descriptionHtml ? (
          <p
            className="w-full text-left text-lg sm:text-xl"
            style={{
              color: '#101010',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.3s',
            }}
            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          />
        ) : (
          <p
            className="w-full text-left text-lg sm:text-xl"
            style={{
              color: '#101010',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.3s',
            }}
          >
            {personName} is currently <em>down</em> <strong>{lostAmount}</strong> and feeling{' '}
            <strong>amazing</strong>!
          </p>
        )}
      </div>

      <div className="mx-auto w-full max-w-[600px] px-6 pb-6 sm:mx-auto sm:max-w-[31rem] sm:px-8">
        <button
          onClick={handleContinue}
          className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full py-[18px] text-base font-normal text-white active:scale-[0.98] sm:text-[1.125rem]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Next{' '}
          <span className="text-lg" aria-hidden="true">
            &#10132;
          </span>
        </button>
      </div>
    </div>
  );
}
