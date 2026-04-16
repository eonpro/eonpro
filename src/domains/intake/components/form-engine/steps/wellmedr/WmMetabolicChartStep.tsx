'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions } from '../../../../store/intakeStore';

interface WmMetabolicChartStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmMetabolicChartStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmMetabolicChartStepProps) {
  const router = useRouter();
  const { markStepCompleted, setCurrentStep } = useIntakeActions();

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };
  const [mounted, setMounted] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);
  const fadeInStyle = { opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' };

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;

    const delay = setTimeout(() => {
      requestAnimationFrame(() => {
        path.style.transition = 'stroke-dashoffset 2s cubic-bezier(0.4, 0, 0.2, 1)';
        path.style.strokeDashoffset = '0';
      });
    }, 400);

    const timer = setTimeout(() => setAnimDone(true), 2500);
    return () => {
      clearTimeout(delay);
      clearTimeout(timer);
    };
  }, []);

  const handleContinue = () => {
    markStepCompleted('metabolic-chart');
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
        <div>
          {prevStep && (
            <button
              onClick={handleBack}
              className="rounded-lg p-2.5 transition-all hover:bg-black/5 active:scale-95"
              aria-label="Go back"
            >
              <svg
                className="h-5 w-5"
                style={{ color: '#101010' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}
        </div>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center px-6 pb-6 sm:px-8">
        <h1
          className="mb-2 text-center text-[1.5rem] font-bold leading-tight sm:text-[2rem]"
          style={{ color: '#101010' }}
        >
          How will GLP-1{' '}
          <span
            className="font-normal italic"
            style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}
          >
            work for you?
          </span>
        </h1>

        <div
          className="mt-6 w-full overflow-hidden rounded-2xl"
          style={{ backgroundColor: '#8a7d6e' }}
        >
          <svg viewBox="0 0 600 320" className="w-full" preserveAspectRatio="xMidYMid meet">
            {/* Y axis arrow */}
            <line
              x1="70"
              y1="260"
              x2="70"
              y2="30"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
            />
            <polygon points="70,25 65,35 75,35" fill="rgba(255,255,255,0.4)" />

            {/* X axis */}
            <line
              x1="70"
              y1="260"
              x2="560"
              y2="260"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
            />

            {/* Horizontal dashed grid lines */}
            <line
              x1="70"
              y1="80"
              x2="560"
              y2="80"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
              strokeDasharray="6,4"
            />
            <line
              x1="70"
              y1="170"
              x2="560"
              y2="170"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
              strokeDasharray="6,4"
            />

            {/* Y axis label */}
            <text
              x="45"
              y="100"
              fill="white"
              fontSize="14"
              fontWeight="600"
              textAnchor="middle"
              transform="rotate(-90 45 150)"
            >
              Metabolic rate
            </text>

            {/* Ease of weight loss label */}
            <text
              x="480"
              y="150"
              fill="rgba(255,255,255,0.6)"
              fontSize="14"
              fontWeight="500"
              textAnchor="middle"
            >
              Ease of
            </text>
            <text
              x="480"
              y="168"
              fill="rgba(255,255,255,0.6)"
              fontSize="14"
              fontWeight="500"
              textAnchor="middle"
            >
              weight loss
            </text>

            {/* Filled area under curve */}
            <path
              d="M70,255 C110,254 160,252 210,245 C270,233 320,200 370,155 C420,110 450,80 500,60 L560,60 L560,260 L70,260 Z"
              fill="rgba(255,255,255,0.08)"
            />

            {/* Animated S-curve */}
            <path
              ref={pathRef}
              d="M70,255 C110,254 160,252 210,245 C270,233 320,200 370,155 C420,110 450,80 500,60"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Week labels */}
            {['Week 0', 'Week 4', 'Week 8', 'Week 12'].map((label, i) => (
              <text
                key={label}
                x={70 + i * 163}
                y={290}
                fill="white"
                fontSize="14"
                textAnchor="middle"
                fontWeight="600"
              >
                {label}
              </text>
            ))}

            {/* Start dot */}
            <circle cx="70" cy="255" r="6" fill="white" opacity={1} />

            {/* End dot + badge — appear after animation */}
            <circle
              cx="500"
              cy="60"
              r="7"
              fill="white"
              stroke="#7B95A9"
              strokeWidth="3"
              opacity={animDone ? 1 : 0}
              style={{ transition: 'opacity 0.5s ease' }}
            />
            <g opacity={animDone ? 1 : 0} style={{ transition: 'opacity 0.5s ease 0.2s' }}>
              <rect x="430" y="28" width="110" height="28" rx="14" fill="#7B95A9" />
              <text x="485" y="47" fill="white" fontSize="13" fontWeight="700" textAnchor="middle">
                wellmedr.
              </text>
            </g>
          </svg>
        </div>

        <div className="mt-6 w-full space-y-1 text-left">
          <p className="text-base" style={{ color: '#101010' }}>
            <strong>Week 1-4:</strong> Your body gets acclimated to GLP-1 medication
          </p>
          <p className="text-base" style={{ color: '#101010' }}>
            <strong>Week 4-8:</strong> Weight loss is increasing more and more
          </p>
          <p className="text-base" style={{ color: '#101010' }}>
            <strong>Week 9+:</strong> Your body has become a <u>fat burning machine</u>
          </p>
        </div>

        <p className="mt-4 w-full text-left text-base" style={{ color: '#101010' }}>
          We identify the root causes of your metabolic issues, so you get a long-term solution, not
          just another quick fix.
        </p>
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
