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
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
  };
  const [mounted, setMounted] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);
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
    return () => { clearTimeout(delay); clearTimeout(timer); };
  }, []);

  const handleContinue = () => {
    markStepCompleted('metabolic-chart');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full" style={{ padding: '1.5rem 1.5rem 0' }}>
        <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'rgba(53, 28, 12, 0.06)', maxWidth: '48rem', marginInline: 'auto' }}>
          <div className="h-full rounded-full" style={{ width: `${progressPercent}%`, background: 'linear-gradient(90deg, #41362a, #6a5b4b, #8f7e6a, #c3b29e)', transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
        </div>
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
        <h1 className="text-[1.5rem] sm:text-[2rem] font-bold text-center leading-tight mb-2" style={{ color: '#101010' }}>
          How will GLP-1{' '}
          <span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>work for you?</span>
        </h1>

        <div className="w-full mt-6 rounded-2xl overflow-hidden" style={{ backgroundColor: '#6b6256' }}>
          <svg viewBox="0 0 600 300" className="w-full" preserveAspectRatio="xMidYMid meet">
            {/* Y axis label */}
            <text x="25" y="140" fill="rgba(255,255,255,0.45)" fontSize="9" textAnchor="middle" transform="rotate(-90 25 140)">Metabolic rate</text>

            {/* Axes */}
            <line x1="60" y1="250" x2="550" y2="250" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <line x1="60" y1="250" x2="60" y2="30" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

            {/* Week labels */}
            {['Week 0', 'Week 4', 'Week 8', 'Week 12'].map((label, i) => (
              <text key={label} x={60 + i * 163} y={272} fill="rgba(255,255,255,0.7)" fontSize="12" textAnchor="middle" fontWeight="500">{label}</text>
            ))}

            {/* Baseline dashed line */}
            <line x1="60" y1="240" x2="350" y2="240" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeDasharray="5,4" />

            {/* Ease of weight loss label */}
            <text x="530" y="105" fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="middle">Ease of</text>
            <text x="530" y="120" fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="middle">weight loss</text>

            {/* Animated S-curve */}
            <path
              ref={pathRef}
              d="M60,240 C100,239 150,237 200,230 C260,218 310,185 360,140 C410,95 440,70 490,55"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Start dot */}
            <circle cx="60" cy="240" r="5" fill="white" opacity={1} />

            {/* End dot + badge — appear after animation */}
            <circle
              cx="490" cy="55" r="6" fill="white" stroke="#7B95A9" strokeWidth="2.5"
              opacity={animDone ? 1 : 0}
              style={{ transition: 'opacity 0.5s ease' }}
            />
            <g opacity={animDone ? 1 : 0} style={{ transition: 'opacity 0.5s ease 0.2s' }}>
              <rect x="420" y="28" width="100" height="24" rx="12" fill="#7B95A9" />
              <text x="470" y="44" fill="white" fontSize="11" fontWeight="600" textAnchor="middle">wellmedr.</text>
            </g>
          </svg>
        </div>

        <div className="mt-6 text-left w-full space-y-1">
          <p className="text-base" style={{ color: '#101010' }}><strong>Week 1-4:</strong> Your body gets acclimated to GLP-1 medication</p>
          <p className="text-base" style={{ color: '#101010' }}><strong>Week 4-8:</strong> Weight loss is increasing more and more</p>
          <p className="text-base" style={{ color: '#101010' }}><strong>Week 9+:</strong> Your body has become a <u>fat burning machine</u></p>
        </div>

        <p className="mt-4 text-base text-left w-full" style={{ color: '#101010' }}>
          We identify the root causes of your metabolic issues, so you get a long-term solution, not just another quick fix.
        </p>
      </div>

      <div className="w-full max-w-[600px] sm:max-w-[31rem] sm:mx-auto mx-auto px-6 sm:px-8 pb-6">
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
