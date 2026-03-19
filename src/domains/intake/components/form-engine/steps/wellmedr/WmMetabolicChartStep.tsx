'use client';

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
  progressPercent,
}: WmMetabolicChartStepProps) {
  const router = useRouter();
  const { markStepCompleted, setCurrentStep } = useIntakeActions();

  const handleContinue = () => {
    markStepCompleted('metabolic-chart');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const svgW = 600;
  const svgH = 300;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--intake-bg, #F7F7F9)' }}>
      <div className="w-full h-1 bg-gray-100">
        <div className="h-full transition-all duration-300" style={{ width: `${progressPercent}%`, backgroundColor: 'var(--intake-accent, #7B95A9)' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-7 mb-8" />

        <h1 className="text-[1.5rem] sm:text-[2rem] font-bold text-center leading-tight mb-2" style={{ color: '#101010' }}>
          How will GLP-1{' '}
          <span className="font-normal italic" style={{ color: 'var(--intake-accent, #7B95A9)', fontFamily: 'var(--font-bodoni, serif)' }}>work for you?</span>
        </h1>

        <div className="w-full mt-6 rounded-2xl overflow-hidden" style={{ backgroundColor: '#6b6256' }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            <text x="30" y="40" fill="rgba(255,255,255,0.5)" fontSize="10" transform="rotate(-90 30 40)">Metabolic rate</text>
            <text x="520" y="100" fill="rgba(255,255,255,0.6)" fontSize="11">Ease of</text>
            <text x="520" y="115" fill="rgba(255,255,255,0.6)" fontSize="11">weight loss</text>

            <line x1="60" y1="250" x2="550" y2="250" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <line x1="60" y1="250" x2="60" y2="30" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

            {['Week 0', 'Week 4', 'Week 8', 'Week 12'].map((label, i) => (
              <text key={label} x={60 + i * 160} y={270} fill="rgba(255,255,255,0.7)" fontSize="11" textAnchor="middle">{label}</text>
            ))}

            <path d="M60,240 C120,238 180,220 240,180 C300,140 380,80 480,55" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />

            <line x1="60" y1="240" x2="300" y2="240" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeDasharray="4,3" />

            <circle cx="60" cy="240" r="5" fill="white" />
            <circle cx="480" cy="55" r="6" fill="white" stroke="var(--intake-accent, #7B95A9)" strokeWidth="2" />

            <rect x="420" y="30" width="90" height="22" rx="11" fill="var(--intake-accent, #7B95A9)" opacity="0.85" />
            <text x="465" y="45" fill="white" fontSize="10" fontWeight="500" textAnchor="middle">wellmedr.</text>
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

      <div className="px-6 lg:px-8 pb-8 max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-3 py-4 px-8 text-white font-medium rounded-full"
          style={{ backgroundColor: 'var(--intake-primary, #0C2631)' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
