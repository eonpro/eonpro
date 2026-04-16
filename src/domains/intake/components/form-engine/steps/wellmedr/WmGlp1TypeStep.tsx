'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmGlp1TypeStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmGlp1TypeStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmGlp1TypeStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [selected, setSelected] = useState(String(responses.glp1_type || ''));
  const [dose, setDose] = useState(String(responses.glp1_dose || ''));
  const [otherName, setOtherName] = useState(String(responses.glp1_type_other || ''));
  const [otherDose, setOtherDose] = useState(String(responses.glp1_dose_other || ''));

  const options = [
    { id: 'semaglutide', label: 'Semaglutide (Ozempic / Wegovy compound equivalent)' },
    { id: 'tirzepatide', label: 'Tirzepatide (Mounjaro / Zepbound compound equivalent)' },
    { id: 'other', label: 'Other' },
  ];

  const semaDoses = ['0.25', '0.5', '1.0', '1.7', '2.4'];
  const tirzDoses = ['2.5', '5', '7.5', '10', '12.5', '15'];

  const advance = (overrides?: { type?: string; doseVal?: string }) => {
    const t = overrides?.type ?? selected;
    const d = overrides?.doseVal ?? dose;
    if (!t) return;
    if ((t === 'semaglutide' || t === 'tirzepatide') && !d) return;
    if (t === 'other' && !otherName.trim()) return;
    setResponse('glp1_type', t);
    if (d) setResponse('glp1_dose', d);
    if (t === 'other') {
      setResponse('glp1_type_other', otherName);
      if (otherDose) setResponse('glp1_dose_other', otherDose);
    }
    markStepCompleted('glp1-type-wm');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleContinue = () => advance();

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
      <style>{`
        .wm-input {
          width: 100%;
          height: 64px;
          padding: 0 2rem;
          font-size: 1rem;
          font-weight: 500;
          color: #101010;
          background-color: #fff;
          border: 1px solid rgba(53, 28, 12, 0.12);
          border-radius: 20px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .wm-input:focus {
          border-color: #7b95a9;
          box-shadow: 0 0 0 2px #7b95a9;
        }
        .wm-input::placeholder {
          opacity: 0.3; color: #101010; font-weight: 400;
        }
      `}</style>
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

      <div className="mx-auto flex w-full max-w-[540px] flex-1 flex-col justify-center px-8 pb-6 sm:px-10">
        <h1
          className="mb-2 text-center text-[1.25rem] font-bold sm:text-[1.5rem]"
          style={{ color: '#101010' }}
        >
          Great! You have experience with
          <br />
          <span
            className="font-normal italic"
            style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}
          >
            weight loss medication.
          </span>
        </h1>

        <h2
          className="mb-6 text-center text-[1.125rem] font-bold sm:text-[1.375rem]"
          style={{ color: '#101010' }}
        >
          Which weight loss medication have you taken?
          <span className="ml-1" style={{ color: '#7B95A9' }}>
            *
          </span>
        </h2>

        <div className="mb-4 w-full space-y-3">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className="flex w-full items-center gap-3 rounded-3xl border-2 bg-white px-5 py-4 text-left transition-all"
              style={{
                borderColor: selected === opt.id ? 'var(--intake-accent, #7B95A9)' : '#e5e7eb',
              }}
            >
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: selected === opt.id ? 'var(--intake-accent, #7B95A9)' : '#d1d5db',
                }}
              >
                {selected === opt.id && (
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: '#c3b29e' }}
                  />
                )}
              </div>
              <span className="text-sm sm:text-base">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Dose selection for Semaglutide / Tirzepatide */}
        {(selected === 'semaglutide' || selected === 'tirzepatide') && (
          <div className="mt-2 w-full">
            <h3
              className="mb-4 text-center text-[1.125rem] font-bold sm:text-[1.25rem]"
              style={{ color: '#101010' }}
            >
              What dose were you most recently taking?
            </h3>
            <div className="w-full space-y-3">
              {(selected === 'semaglutide' ? semaDoses : tirzDoses).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDose(d);
                    advance({ type: selected, doseVal: d });
                  }}
                  className="flex w-full items-center gap-3 rounded-3xl border-2 bg-white px-5 py-4 text-left transition-all"
                  style={{ borderColor: dose === d ? '#0C2631' : 'rgba(0,0,0,0.06)' }}
                >
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                    style={{ borderColor: dose === d ? '#0C2631' : '#d1d5db' }}
                  >
                    {dose === d && (
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: '#0C2631' }}
                      />
                    )}
                  </div>
                  <span className="text-base font-medium">{d}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Other: medication name + dose text fields */}
        {selected === 'other' && (
          <div className="mt-2 w-full space-y-4">
            <div>
              <label className="mb-2 block text-base font-medium" style={{ color: '#101010' }}>
                Please specify the medication name.
              </label>
              <input
                type="text"
                value={otherName}
                onChange={(e) => setOtherName(e.target.value)}
                placeholder="Medication name"
                className="wm-input"
              />
            </div>
            <div>
              <label className="mb-2 block text-base font-medium" style={{ color: '#101010' }}>
                What dose were you most recently taking?
              </label>
              <input
                type="text"
                value={otherDose}
                onChange={(e) => setOtherDose(e.target.value)}
                placeholder="Dose"
                className="wm-input"
              />
            </div>
          </div>
        )}
      </div>

      {/* Show Next button only for "Other" type which needs free-text input */}
      {selected === 'other' && (
        <div className="mx-auto w-full max-w-[600px] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-[31rem] sm:px-8">
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
      )}

      {/* Copyright footer */}
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
