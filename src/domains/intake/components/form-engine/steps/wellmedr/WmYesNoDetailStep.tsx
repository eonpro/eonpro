'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmYesNoDetailStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  headerText?: string;
  headerItalic?: string;
  question: string;
  detailPrompt: string;
  storageKey: string;
  detailStorageKey: string;
}

export default function WmYesNoDetailStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  headerText,
  question,
  detailPrompt,
  storageKey,
  detailStorageKey,
}: WmYesNoDetailStepProps) {
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

  const [answer, setAnswer] = useState<string>(String(responses[storageKey] || ''));
  const [detail, setDetail] = useState<string>(String(responses[detailStorageKey] || ''));

  const handleSelect = (opt: string) => {
    navigator.vibrate?.(10);
    setAnswer(opt);
    if (opt === 'no') {
      setResponse(storageKey, 'no');
      markStepCompleted(storageKey);
      setTimeout(() => {
        setCurrentStep(nextStep);
        router.push(`${basePath}/${nextStep}`);
      }, 300);
    }
  };

  const handleContinue = () => {
    if (!answer) return;
    setResponse(storageKey, answer);
    if (answer === 'yes' && detail) setResponse(detailStorageKey, detail);
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
        {headerText && (
          <p
            className="mb-3 text-center text-[15px] font-medium sm:text-lg"
            style={{
              color: '#101010',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.1s',
            }}
          >
            {headerText}
          </p>
        )}

        <h2
          className="mb-6 text-center text-xl font-bold sm:text-[1.5rem]"
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

        <div className="mb-4 grid w-full grid-cols-2 gap-3">
          {['yes', 'no'].map((opt, i) => (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className="flex items-center gap-3 overflow-hidden rounded-[18px] px-5 py-4"
              style={{
                backgroundColor: answer === opt ? '#f5f0e8' : '#fff',
                border: `2px solid ${answer === opt ? '#c3b29e' : 'rgba(0,0,0,0.06)'}`,
                boxShadow:
                  answer === opt
                    ? '0 0 0 2px #c3b29e, 0 2px 8px rgba(195,178,158,0.15)'
                    : '0 1px 3px rgba(0,0,0,0.04)',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'scale(1)' : 'scale(0.95)',
                transition: `all 0.35s cubic-bezier(0.4,0,0.2,1) ${0.15 + i * 0.05}s`,
              }}
            >
              <div
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                style={{
                  border: `2px solid ${answer === opt ? '#c3b29e' : '#d1d5db'}`,
                  backgroundColor: answer === opt ? '#c3b29e' : 'transparent',
                  transition: 'all 0.25s ease',
                }}
              >
                {answer === opt && (
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
                {opt === 'yes' ? 'Yes' : 'No'}
              </span>
            </button>
          ))}
        </div>

        {answer === 'yes' && (
          <div
            className="mt-1 w-full rounded-2xl p-4"
            style={{ backgroundColor: '#eef2f5', animation: 'wmSlideDown 0.3s ease-out' }}
          >
            <style>{`@keyframes wmSlideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>
            <label className="mb-2 block text-sm font-medium" style={{ color: '#666' }}>
              {detailPrompt}
              <span className="ml-1" style={{ color: '#c3b29e' }}>
                *
              </span>
            </label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Enter your answer"
              rows={4}
              className="w-full resize-y rounded-xl border bg-white p-4 text-base focus:outline-none"
              style={{ borderColor: 'rgba(0,0,0,0.08)', transition: 'border-color 0.2s' }}
              onFocus={(e) => {
                e.target.style.borderColor = '#c3b29e';
                e.target.style.boxShadow = '0 0 0 3px rgba(195,178,158,0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(0,0,0,0.08)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
        )}
      </div>

      {answer === 'yes' && (
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
      )}
    </div>
  );
}
