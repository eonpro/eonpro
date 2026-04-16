'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface RadioOption {
  id: string;
  label: string;
}

interface WmMotivationRadioStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  headerText?: string;
  headerItalic?: string;
  question: string;
  storageKey: string;
  options: RadioOption[];
}

export default function WmMotivationRadioStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  headerText,
  headerItalic,
  question,
  storageKey,
  options,
}: WmMotivationRadioStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);
  const fadeInStyle = { opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease' };

  const [selected, setSelected] = useState<string>(String(responses[storageKey] || ''));

  const handleSelect = (id: string) => {
    navigator.vibrate?.(10);
    setSelected(id);
    setResponse(storageKey, id);
    markStepCompleted(storageKey);
    setTimeout(() => {
      setCurrentStep(nextStep);
      router.push(`${basePath}/${nextStep}`);
    }, 300);
  };

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
        {(headerText || headerItalic) && (
          <h1
            className="mb-4 text-center text-xl font-bold leading-snug sm:text-[1.75rem]"
            style={{
              color: '#101010',
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(12px)',
              transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.05s',
            }}
          >
            {headerText}
            {headerItalic && (
              <>
                {' '}
                <span
                  className="font-normal italic"
                  style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}
                >
                  {headerItalic}
                </span>
              </>
            )}
          </h1>
        )}

        <h2
          className="mb-6 text-center text-lg font-bold sm:text-[1.35rem]"
          style={{
            color: '#101010',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(10px)',
            transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s',
          }}
        >
          {question}
          <span className="ml-1" style={{ color: '#ef4444' }}>
            *
          </span>
        </h2>

        <div className="w-full space-y-3">
          {options.map((opt, i) => {
            const sel = selected === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                className="flex w-full items-center gap-3 rounded-[18px] px-5 py-4 text-left"
                style={{
                  backgroundColor: sel ? '#f5f0e8' : '#fff',
                  border: `2px solid ${sel ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                  boxShadow: sel
                    ? '0 0 0 2px #c3b29e, 0 2px 8px rgba(195,178,158,0.15)'
                    : '0 1px 3px rgba(0,0,0,0.04)',
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                  transition: `all 0.35s cubic-bezier(0.4,0,0.2,1) ${0.12 + i * 0.04}s`,
                }}
              >
                <div
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                  style={{
                    border: `2px solid ${sel ? '#c3b29e' : '#d1d5db'}`,
                    backgroundColor: sel ? '#c3b29e' : 'transparent',
                    transition: 'all 0.25s ease',
                  }}
                >
                  {sel && (
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
                <span className="text-[15px] font-medium" style={{ color: '#101010' }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
