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
  progressPercent,
}: WmAnimatedWeightChartStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const [animProgress, setAnimProgress] = useState(0);
  const animRef = useRef<number>(0);

  const weight = Number(responses.current_weight || responses.currentWeight) || 200;
  const goalWeight = Number(responses.ideal_weight || responses.idealWeight) || 150;
  const diff = Math.max(weight - goalWeight, 1);

  useEffect(() => {
    const start = performance.now();
    const duration = 1200;
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      setAnimProgress(1 - Math.pow(1 - t, 3));
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

  const W = 600, H = 320, L = 70, R = 40, T = 50, B = 55;
  const cW = W - L - R, cH = H - T - B;
  const N = 12;

  const pt = (i: number, decay: number): [number, number] => {
    const t = i / N;
    const y = goalWeight + diff * Math.exp(-decay * t);
    return [L + t * cW, T + ((weight - y) / diff) * cH];
  };

  const points = Array.from({ length: N + 1 }, (_, i) => pt(i, 3));
  const without = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N;
    const y = weight - diff * 0.15 * t;
    return [L + t * cW, T + ((weight - y) / diff) * cH] as [number, number];
  });

  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  const idx = Math.min(Math.floor(animProgress * N), N);
  const cp = points[idx] || points[0];

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-5 sm:px-8 pt-6 sm:pt-8 pb-4 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

        <h1 className="text-xl sm:text-[2rem] font-bold text-center leading-tight mb-4" style={{ color: '#101010' }}>
          It feels like magic, but it&apos;s{' '}
          <span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: 'var(--font-bodoni, serif)' }}>metabolic science.</span>
        </h1>

        <div className="w-full rounded-2xl overflow-hidden" style={{ backgroundColor: '#6b6256' }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            {/* Axes */}
            <line x1={L} y1={T} x2={L} y2={H - B} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

            {/* Labels */}
            <text x={L - 8} y={T + 5} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="end">{weight}</text>
            <text x={L - 8} y={H - B + 4} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="end">{goalWeight}</text>
            {[1, 4, 8, 12].map((m) => (
              <text key={m} x={L + (m / N) * cW} y={H - 15} fill="rgba(255,255,255,0.6)" fontSize="11" textAnchor="middle">Month {m}</text>
            ))}

            {/* "without" dashed line */}
            <path d={path(without)} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="6,4" />
            <text x={without[N][0] - 5} y={without[N][1] - 8} fill="rgba(255,255,255,0.4)" fontSize="10" textAnchor="end">without wellmedr.</text>

            {/* Animated "with" line */}
            <path d={path(points.slice(0, idx + 1))} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />

            {/* Start dot */}
            <circle cx={points[0][0]} cy={points[0][1]} r="4" fill="white" />
            <text x={points[0][0] + 8} y={points[0][1] - 6} fill="white" fontSize="11" fontWeight="500">Current weight</text>

            {/* End badge */}
            {animProgress > 0.7 && (
              <g style={{ opacity: Math.min((animProgress - 0.7) / 0.3, 1) }}>
                <rect x={cp[0] - 42} y={cp[1] - 26} width="92" height="22" rx="11" fill="#7B95A9" />
                <text x={cp[0] + 4} y={cp[1] - 11} fill="white" fontSize="10" fontWeight="600" textAnchor="middle">with wellmedr.</text>
              </g>
            )}
            <circle cx={cp[0]} cy={cp[1]} r="5" fill="white" stroke="#7B95A9" strokeWidth="2" />
          </svg>
        </div>

        <div className="mt-5 text-center space-y-2 px-2">
          <p className="text-[15px] sm:text-base" style={{ color: '#101010' }}>
            On average, Wellmedr patients <strong>lose over 22% of their body weight.</strong>
          </p>
          <p className="text-[15px] sm:text-base" style={{ color: '#101010' }}>
            GLP-1 medications are <strong>extremely effective</strong> &ndash; offering you a strong path toward your{' '}
            <span className="font-bold" style={{ color: '#7B95A9' }}>{goalWeight} pound</span> goal weight.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full" style={{ backgroundColor: '#F7F7F9' }}>
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-white font-medium text-base rounded-full active:scale-[0.98]"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
