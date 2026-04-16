'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface CheckboxOption {
  id: string;
  label: string;
}

interface WmCheckboxListStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  headerItalic?: string;
  headerText?: string;
  subtitleText?: string;
  question: string;
  storageKey: string;
  options: CheckboxOption[];
  noneOptionId?: string;
}

export default function WmCheckboxListStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  headerItalic,
  headerText,
  subtitleText,
  question,
  storageKey,
  options,
  noneOptionId = 'none',
}: WmCheckboxListStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);
  const fadeInStyle = { opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  const [selected, setSelected] = useState<string[]>(
    Array.isArray(responses[storageKey]) ? (responses[storageKey] as string[]) : []
  );

  const handleToggle = (id: string) => {
    navigator.vibrate?.(10);
    if (id === noneOptionId) {
      if (selected.includes(noneOptionId)) {
        setSelected([]);
      } else {
        setSelected([noneOptionId]);
        setResponse(storageKey, [noneOptionId]);
        markStepCompleted(storageKey);
        setTimeout(() => { setCurrentStep(nextStep); router.push(`${basePath}/${nextStep}`); }, 300);
      }
      return;
    }
    const withoutNone = selected.filter((s) => s !== noneOptionId);
    setSelected(
      withoutNone.includes(id) ? withoutNone.filter((s) => s !== id) : [...withoutNone, id]
    );
  };

  const handleContinue = () => {
    if (selected.length === 0) return;
    setResponse(storageKey, selected);
    markStepCompleted(storageKey);
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
        {(headerItalic || headerText) && (
          <div
            className="mb-3 text-center"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(10px)',
              transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.05s',
            }}
          >
            {headerItalic && (
              <p
                className="mb-1 text-xl italic sm:text-2xl"
                style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}
              >
                {headerItalic}
              </p>
            )}
            {headerText && (
              <p className="text-base font-bold sm:text-xl" style={{ color: '#101010' }}>
                {headerText}
              </p>
            )}
          </div>
        )}

        {subtitleText && (
          <p
            className="mb-3 text-center text-sm sm:text-base"
            style={{
              color: '#888',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.15s',
            }}
          >
            {subtitleText}
          </p>
        )}

        <h2
          className="mb-5 text-center text-lg font-bold sm:text-[1.4rem]"
          style={{
            color: '#101010',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(10px)',
            transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s',
          }}
        >
          {question}
          <span className="ml-1" style={{ color: '#c3b29e' }}>
            *
          </span>
        </h2>

        <div className="w-full space-y-2">
          {options.map((opt, i) => {
            const sel = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => handleToggle(opt.id)}
                className="flex w-full items-start gap-3 rounded-[14px] px-4 py-3.5 text-left"
                style={{
                  backgroundColor: sel ? '#f5f0e8' : '#fff',
                  border: `1.5px solid ${sel ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                  boxShadow: sel ? '0 0 0 1px #c3b29e' : '0 1px 2px rgba(0,0,0,0.03)',
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateX(0)' : 'translateX(-8px)',
                  transition: `all 0.3s cubic-bezier(0.4,0,0.2,1) ${Math.min(i * 0.02, 0.3)}s`,
                }}
              >
                <div
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded"
                  style={{
                    border: `2px solid ${sel ? '#c3b29e' : '#d1d5db'}`,
                    backgroundColor: sel ? '#c3b29e' : 'transparent',
                    borderRadius: '5px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {sel && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
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
                <span
                  className="text-[14px] leading-snug sm:text-[15px]"
                  style={{ color: '#101010' }}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="mx-auto w-full max-w-[600px] px-6 pb-6 sm:mx-auto sm:max-w-[31rem] sm:px-8"
        style={{ backgroundColor: '#F7F7F9' }}
      >
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
