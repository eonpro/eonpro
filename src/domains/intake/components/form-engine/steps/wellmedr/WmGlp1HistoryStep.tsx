'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmGlp1HistoryStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmGlp1HistoryStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmGlp1HistoryStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const [answer, setAnswer] = useState<string>(String(responses.glp1_history_recent || ''));

  const handleSelect = (opt: string) => {
    navigator.vibrate?.(10);
    setAnswer(opt);
    setResponse('glp1_history_recent', opt);
    markStepCompleted('glp1-history');

    const target = opt === 'yes' ? 'glp1-type-wm' : 'opioids';
    setTimeout(() => {
      setCurrentStep(target);
      router.push(`${basePath}/${target}`);
    }, 300);
  };

  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && answer) {
        handleSelectRef.current(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer]);

  const options = [
    { id: 'yes', label: "Yes, I've taken GLP-1 medication" },
    { id: 'no', label: 'No' },
  ];

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

      <div
        className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center px-6 pb-6 sm:px-8"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(8px)',
          transition:
            'opacity 0.45s cubic-bezier(0.16,1,0.3,1), transform 0.45s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <h2
          className="mb-8 text-center text-xl font-bold sm:text-[1.5rem]"
          style={{ color: '#101010' }}
        >
          Have you taken medication for weight loss within the past 4 weeks?
          <span className="ml-1" style={{ color: '#ef4444' }}>
            *
          </span>
        </h2>

        <div className="w-full space-y-3">
          {options.map((opt, i) => (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              className="flex w-full items-center gap-3 rounded-[18px] px-5 py-4 text-left"
              style={{
                backgroundColor: answer === opt.id ? '#f5f0e8' : '#fff',
                border: `2px solid ${answer === opt.id ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                boxShadow:
                  answer === opt.id
                    ? '0 0 0 2px #c3b29e, 0 2px 8px rgba(195,178,158,0.15)'
                    : '0 1px 3px rgba(0,0,0,0.04)',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'scale(1)' : 'scale(0.95)',
                transition: `all 0.35s cubic-bezier(0.4,0,0.2,1) ${0.15 + i * 0.06}s`,
              }}
            >
              <div
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                style={{
                  border: `2px solid ${answer === opt.id ? '#c3b29e' : '#d1d5db'}`,
                  backgroundColor: answer === opt.id ? '#c3b29e' : 'transparent',
                  transition: 'all 0.25s ease',
                }}
              >
                {answer === opt.id && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 6L5 8.5L9.5 3.5"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className="text-[15px] font-semibold" style={{ color: '#101010' }}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="pb-6 text-center">
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.5 }}>
          &copy; 2026 EONPro, LLC. All rights reserved.
          <br />
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
