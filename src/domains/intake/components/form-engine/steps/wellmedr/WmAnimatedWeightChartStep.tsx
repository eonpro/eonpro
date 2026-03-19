'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmAnimatedWeightChartStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmAnimatedWeightChartStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmAnimatedWeightChartStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const [animProgress, setAnimProgress] = useState(0);
  const animRef = useRef<number>(0);

  const weight = Number(responses.current_weight) || 200;
  const goalWeight = Number(responses.ideal_weight) || 150;

  useEffect(() => {
    const start = performance.now();
    const duration = 1200;
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimProgress(eased);
      if (t < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const handleContinue = () => {
    markStepCompleted('weight-chart');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const svgW = 600;
  const svgH = 340;
  const padL = 60;
  const padR = 40;
  const padT = 50;
  const padB = 60;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  const months = 12;
  const points: [number, number][] = [];
  for (let i = 0; i <= months; i++) {
    const t = i / months;
    const decay = Math.exp(-3 * t);
    const y = goalWeight + (weight - goalWeight) * decay;
    const px = padL + t * chartW;
    const py = padT + ((weight - y) / (weight - goalWeight)) * chartH;
    points.push([px, svgH - padB - ((y - goalWeight) / (weight - goalWeight)) * chartH]);
  }

  const withoutLine: [number, number][] = [];
  for (let i = 0; i <= months; i++) {
    const t = i / months;
    const slowDecay = Math.exp(-0.8 * t);
    const y = goalWeight + (weight - goalWeight) * slowDecay * 0.6 + (weight - goalWeight) * 0.4;
    withoutLine.push([padL + t * chartW, svgH - padB - ((y - goalWeight) / (weight - goalWeight)) * chartH]);
  }

  const buildPath = (pts: [number, number][]) => pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');

  const animIdx = Math.floor(animProgress * months);
  const circlePos = points[Math.min(animIdx, points.length - 1)];

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

        <h1 className="text-[1.5rem] sm:text-[2rem] font-bold text-center leading-tight mb-2" style={{ color: '#101010' }}>
          It feels like magic, but it&apos;s{' '}
          <span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: 'var(--font-bodoni, serif)' }}>metabolic science.</span>
        </h1>

        <div className="w-full mt-6 rounded-2xl overflow-hidden" style={{ backgroundColor: '#6b6256' }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="wmChartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>

            {[0, 4, 8, 12].map((m) => (
              <text key={m} x={padL + (m / months) * chartW} y={svgH - 20} fill="rgba(255,255,255,0.7)" fontSize="12" textAnchor="middle">Month {m || 1}</text>
            ))}

            <text x={padL - 10} y={padT + 10} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="end">{weight}</text>
            <text x={padL - 10} y={svgH - padB} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="end">{goalWeight}</text>

            <line x1={padL} y1={padT} x2={padL} y2={svgH - padB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            <line x1={padL} y1={svgH - padB} x2={svgW - padR} y2={svgH - padB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

            <path d={buildPath(withoutLine)} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeDasharray="6,4" />
            <text x={withoutLine[months][0] - 20} y={withoutLine[months][1] - 10} fill="rgba(255,255,255,0.5)" fontSize="11">without wellmedr.</text>

            <path
              d={buildPath(points.slice(0, animIdx + 1))}
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />

            <circle cx={points[0][0]} cy={points[0][1]} r="5" fill="white" />
            <text x={points[0][0] + 10} y={points[0][1] - 8} fill="white" fontSize="12" fontWeight="500">Current weight</text>

            {animProgress > 0.8 && (
              <>
                <rect x={circlePos[0] - 45} y={circlePos[1] - 28} width="100" height="24" rx="12" fill="var(--intake-accent, #7B95A9)" opacity="0.9" />
                <text x={circlePos[0] + 5} y={circlePos[1] - 12} fill="white" fontSize="11" fontWeight="500" textAnchor="middle">with wellmedr.</text>
              </>
            )}
            <circle cx={circlePos[0]} cy={circlePos[1]} r="6" fill="white" stroke="var(--intake-accent, #7B95A9)" strokeWidth="2" />
          </svg>
        </div>

        <div className="mt-6 text-center space-y-3">
          <p className="text-base" style={{ color: '#101010' }}>
            On average, Wellmedr patients <strong>lose over 22% of their body weight.</strong>
          </p>
          <p className="text-base" style={{ color: '#101010' }}>
            GLP-1 medications are <strong>extremely effective</strong> &ndash; offering you a strong path toward your{' '}
            <span className="font-bold" style={{ color: '#7B95A9' }}>{goalWeight} pound</span> goal weight.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full">
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
