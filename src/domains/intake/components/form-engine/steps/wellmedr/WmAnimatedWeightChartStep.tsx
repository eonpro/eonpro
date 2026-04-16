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

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

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
    return () => {
      clearTimeout(delay);
      clearTimeout(badge);
      clearTimeout(done);
    };
  }, []);

  const handleContinue = () => {
    markStepCompleted('weight-chart');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleContinueRef = useRef(handleContinue);
  handleContinueRef.current = handleContinue;
  const animCompleteRef = useRef(animComplete);
  animCompleteRef.current = animComplete;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && animCompleteRef.current) handleContinueRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);


  const W = 600,
    H = 320,
    L = 70,
    R = 40,
    T = 50,
    B = 55;
  const cW = W - L - R,
    cH = H - T - B;

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
        <h1
          className="mb-4 w-full text-center text-xl font-bold leading-tight sm:text-[2rem]"
          style={{
            color: '#101010',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s',
          }}
        >
          It feels like magic, but it&apos;s{' '}
          <span
            className="font-normal italic"
            style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}
          >
            metabolic science.
          </span>
        </h1>

        <div
          className="w-full overflow-hidden rounded-2xl"
          style={{
            backgroundColor: '#6b6256',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'scale(1)' : 'scale(0.97)',
            transition: 'all 0.7s cubic-bezier(0.4,0,0.2,1) 0.2s',
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines */}
            <line x1={L} y1={T} x2={L} y2={H - B} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            <line
              x1={L}
              y1={H - B}
              x2={W - R}
              y2={H - B}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />

            {/* Y labels */}
            <text x={L - 8} y={T + 5} fill="rgba(255,255,255,0.45)" fontSize="10" textAnchor="end">
              {weight}
            </text>
            <text
              x={L - 8}
              y={H - B + 4}
              fill="rgba(255,255,255,0.45)"
              fontSize="10"
              textAnchor="end"
            >
              {goalWeight}
            </text>

            {/* X labels */}
            {[1, 4, 8, 12].map((m) => (
              <text
                key={m}
                x={L + (m / 12) * cW}
                y={H - 15}
                fill="rgba(255,255,255,0.55)"
                fontSize="11"
                textAnchor="middle"
                fontWeight="500"
              >
                Month {m}
              </text>
            ))}

            {/* "without" dashed line — static */}
            <path
              d={withoutCurve}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1.5"
              strokeDasharray="6,4"
            />
            <circle cx={endX} cy={withoutEndY} r="3.5" fill="rgba(255,255,255,0.3)" />
            <text
              x={endX - 8}
              y={withoutEndY - 10}
              fill="rgba(255,255,255,0.35)"
              fontSize="10"
              textAnchor="end"
            >
              without wellmedr.
            </text>

            {/* Animated "with" curve — pure CSS stroke-dashoffset */}
            <path
              ref={pathRef}
              d={withCurve}
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Start dot — always visible */}
            <circle cx={L} cy={T} r="4.5" fill="white">
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                dur="0.4s"
                begin="0.3s"
                fill="freeze"
              />
            </circle>
            <text x={L + 10} y={T - 8} fill="white" fontSize="11" fontWeight="500" opacity="0">
              Current weight
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                dur="0.4s"
                begin="0.5s"
                fill="freeze"
              />
            </text>

            {/* End badge — fades in after line finishes */}
            <g
              style={{
                opacity: showBadge ? 1 : 0,
                transition: 'opacity 0.6s cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              <rect x={endX - 50} y={endY - 28} width="96" height="24" rx="12" fill="#7B95A9" />
              <text
                x={endX - 2}
                y={endY - 12}
                fill="white"
                fontSize="10"
                fontWeight="600"
                textAnchor="middle"
              >
                with wellmedr.
              </text>
            </g>
            <circle
              cx={endX}
              cy={endY}
              r="5.5"
              fill="white"
              stroke="#7B95A9"
              strokeWidth="2.5"
              style={{
                opacity: showBadge ? 1 : 0,
                transition: 'opacity 0.4s ease',
                transform: showBadge ? 'scale(1)' : 'scale(0)',
                transformOrigin: `${endX}px ${endY}px`,
              }}
            />
          </svg>
        </div>

        <div
          className="mt-6 w-full space-y-3 text-left"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(10px)',
            transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.4s',
          }}
        >
          <p className="text-base sm:text-lg" style={{ color: '#101010' }}>
            On average, Wellmedr patients <strong>lose over 22% of their body weight.</strong>
          </p>
          <p className="text-base sm:text-lg" style={{ color: '#101010' }}>
            GLP-1 medications are <strong>extremely effective</strong> &ndash; offering you a strong
            path toward your {goalWeight} pound goal weight.
          </p>
        </div>
      </div>

      <div
        className="mx-auto w-full max-w-[600px] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-[31rem] sm:px-8"
        style={{
          opacity: animComplete ? 1 : 0,
          transform: animComplete ? 'translateY(0)' : 'translateY(8px)',
          transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <button
          onClick={handleContinue}
          className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full py-[18px] text-base font-normal text-white active:scale-[0.98] sm:text-[1.125rem]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Next{' '}
          <span className="text-base" aria-hidden>
            &#10132;
          </span>
        </button>
      </div>
    </div>
  );
}
