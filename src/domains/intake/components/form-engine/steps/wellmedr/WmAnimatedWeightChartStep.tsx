'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
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
  const pathRef = useRef<SVGPathElement>(null);
  const [showBadge, setShowBadge] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [animComplete, setAnimComplete] = useState(false);

  const fadeStyle: CSSProperties = { opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' };

  const weight = Number(responses.current_weight || responses.currentWeight) || 200;
  const goalWeight = Number(responses.ideal_weight || responses.idealWeight) || 150;
  const diff = Math.max(weight - goalWeight, 1);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;

    const delay = setTimeout(() => {
      el.style.transition = 'stroke-dashoffset 2.2s cubic-bezier(0.4, 0, 0.15, 1)';
      el.style.strokeDashoffset = '0';
    }, 600);

    const badge = setTimeout(() => setShowBadge(true), 2400);
    const done = setTimeout(() => setAnimComplete(true), 2800);
    return () => { clearTimeout(delay); clearTimeout(badge); clearTimeout(done); };
  }, []);

  const handleContinue = () => {
    markStepCompleted('weight-chart');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleBack = () => {
    if (prevStep) { setCurrentStep(prevStep); router.push(`${basePath}/${prevStep}`); }
  };

  const W = 600, H = 320, L = 70, R = 40, T = 50, B = 55;
  const cW = W - L - R, cH = H - T - B;

  const buildCurve = (decay: number) => {
    const pts: string[] = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = goalWeight + diff * Math.exp(-decay * t);
      const px = (L + t * cW).toFixed(1);
      const py = (T + ((weight - y) / diff) * cH).toFixed(1);
      pts.push(i === 0 ? `M${px},${py}` : `L${px},${py}`);
    }
    return pts.join(' ');
  };

  const withCurve = buildCurve(3);

  const withoutPts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const y = weight - diff * 0.15 * t;
    const px = (L + t * cW).toFixed(1);
    const py = (T + ((weight - y) / diff) * cH).toFixed(1);
    withoutPts.push(i === 0 ? `M${px},${py}` : `L${px},${py}`);
  }
  const withoutCurve = withoutPts.join(' ');

  const endX = L + cW;
  const endY = T + ((weight - goalWeight) / diff) * cH;
  const withoutEndY = T + ((weight - (weight - diff * 0.15)) / diff) * cH;

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

      <div className="flex-1 flex flex-col justify-center w-full max-w-[600px] mx-auto px-6 sm:px-8 pb-6">
        <h1 className="text-xl sm:text-[2rem] font-bold text-center leading-tight mb-4 w-full"
          style={{ color: '#101010', opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s' }}>
          It feels like magic, but it&apos;s{' '}
          <span className="font-normal italic" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>metabolic science.</span>
        </h1>

        <div className="w-full rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#6b6256', opacity: mounted ? 1 : 0, transform: mounted ? 'scale(1)' : 'scale(0.97)', transition: 'all 0.7s cubic-bezier(0.4,0,0.2,1) 0.2s' }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines */}
            <line x1={L} y1={T} x2={L} y2={H - B} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

            {/* Y labels */}
            <text x={L - 8} y={T + 5} fill="rgba(255,255,255,0.45)" fontSize="10" textAnchor="end">{weight}</text>
            <text x={L - 8} y={H - B + 4} fill="rgba(255,255,255,0.45)" fontSize="10" textAnchor="end">{goalWeight}</text>

            {/* X labels */}
            {[1, 4, 8, 12].map((m) => (
              <text key={m} x={L + (m / 12) * cW} y={H - 15} fill="rgba(255,255,255,0.55)" fontSize="11" textAnchor="middle" fontWeight="500">Month {m}</text>
            ))}

            {/* "without" dashed line — static */}
            <path d={withoutCurve} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeDasharray="6,4" />
            <circle cx={endX} cy={withoutEndY} r="3.5" fill="rgba(255,255,255,0.3)" />
            <text x={endX - 8} y={withoutEndY - 10} fill="rgba(255,255,255,0.35)" fontSize="10" textAnchor="end">without wellmedr.</text>

            {/* Animated "with" curve — pure CSS stroke-dashoffset */}
            <path ref={pathRef} d={withCurve} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />

            {/* Start dot — always visible */}
            <circle cx={L} cy={T} r="4.5" fill="white">
              <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.3s" fill="freeze" />
            </circle>
            <text x={L + 10} y={T - 8} fill="white" fontSize="11" fontWeight="500" opacity="0">
              Current weight
              <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="0.5s" fill="freeze" />
            </text>

            {/* End badge — fades in after line finishes */}
            <g style={{ opacity: showBadge ? 1 : 0, transition: 'opacity 0.6s cubic-bezier(0.4,0,0.2,1)' }}>
              <rect x={endX - 50} y={endY - 28} width="96" height="24" rx="12" fill="#7B95A9" />
              <text x={endX - 2} y={endY - 12} fill="white" fontSize="10" fontWeight="600" textAnchor="middle">with wellmedr.</text>
            </g>
            <circle cx={endX} cy={endY} r="5.5" fill="white" stroke="#7B95A9" strokeWidth="2.5"
              style={{ opacity: showBadge ? 1 : 0, transition: 'opacity 0.4s ease', transform: showBadge ? 'scale(1)' : 'scale(0)', transformOrigin: `${endX}px ${endY}px` }} />
          </svg>
        </div>

        <div className="mt-5 text-center space-y-2 px-2 w-full"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)', transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.4s' }}>
          <p className="text-[15px] sm:text-base" style={{ color: '#101010' }}>
            On average, Wellmedr patients <strong>lose over 22% of their body weight.</strong>
          </p>
          <p className="text-[15px] sm:text-base" style={{ color: '#101010' }}>
            GLP-1 medications are <strong>extremely effective</strong> &ndash; offering you a strong path toward your{' '}
            <span className="font-bold" style={{ color: '#7B95A9' }}>{goalWeight} pound</span> goal weight.
          </p>
        </div>
      </div>

      <div className="w-full max-w-[600px] sm:max-w-[31rem] mx-auto sm:mx-auto px-6 sm:px-8 pb-8"
        style={{ opacity: animComplete ? 1 : 0, transform: animComplete ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)' }}>
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-4 py-[18px] text-white font-normal text-base sm:text-[1.125rem] rounded-full active:scale-[0.98]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Next <span className="text-base" aria-hidden>&#10132;</span>
        </button>
      </div>
    </div>
  );
}
