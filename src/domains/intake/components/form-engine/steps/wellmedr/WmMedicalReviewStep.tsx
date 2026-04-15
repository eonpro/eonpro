'use client';

import type { CSSProperties } from 'react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmMedicalReviewStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmMedicalReviewStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmMedicalReviewStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponses, markStepCompleted, setCurrentStep } = useIntakeActions();

  const fadeStyle: CSSProperties = {};

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  const weight = Number(responses.current_weight) || 0;
  const goalWeight = Number(responses.ideal_weight) || 0;
  const lbsToLose = weight - goalWeight;
  const heightFt = Number(responses.height_feet) || 5;
  const heightIn = Number(responses.height_inches) || 4;
  const totalInches = heightFt * 12 + heightIn;
  const bmi = totalInches > 0 ? ((weight / (totalInches * totalInches)) * 703).toFixed(1) : '0';
  const weeksToGoal = Math.max(1, Math.ceil(lbsToLose / 4));

  const [firstName, setFirstName] = useState(String(responses.firstName || ''));
  const [lastName, setLastName] = useState(String(responses.lastName || ''));
  const [state, setState] = useState(String(responses.state || ''));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = 'Required';
    if (!lastName.trim()) e.lastName = 'Required';
    if (!state) e.state = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (!validate()) return;
    setResponses({ firstName, lastName, state });
    markStepCompleted('medical-review');
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

  const US_STATES = [
    'AL',
    'AK',
    'AZ',
    'AR',
    'CA',
    'CO',
    'CT',
    'DE',
    'DC',
    'FL',
    'GA',
    'HI',
    'ID',
    'IL',
    'IN',
    'IA',
    'KS',
    'KY',
    'LA',
    'ME',
    'MD',
    'MA',
    'MI',
    'MN',
    'MS',
    'MO',
    'MT',
    'NE',
    'NV',
    'NH',
    'NJ',
    'NM',
    'NY',
    'NC',
    'ND',
    'OH',
    'OK',
    'OR',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'UT',
    'VT',
    'VA',
    'WA',
    'WV',
    'WI',
    'WY',
  ];

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
          letter-spacing: -0.01em;
          line-height: 1.5rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .wm-input:focus {
          border-color: #7b95a9;
          box-shadow: 0 0 0 2px #7b95a9;
        }
        .wm-input::placeholder {
          opacity: 0.3; color: #101010; font-weight: 400;
        }
        @media (min-width: 640px) {
          .wm-input { height: 72px; font-size: 1.25rem; }
        }
        .wm-select {
          width: 100%;
          height: 64px;
          padding: 0.75rem 2.5rem 0.75rem 1rem;
          font-size: 1rem;
          font-weight: 500;
          color: #101010;
          background-color: #fff;
          border: 1px solid rgba(53, 28, 12, 0.12);
          border-radius: 20px;
          outline: none;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .wm-select:focus {
          border-color: #7b95a9;
          box-shadow: 0 0 0 2px #7b95a9;
        }
        @media (min-width: 640px) {
          .wm-select { height: 72px; font-size: 1.25rem; }
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
        <h2
          className="mb-4 text-center text-[1.5rem] font-bold sm:text-[1.75rem]"
          style={{ color: '#101010' }}
        >
          Your medical review
        </h2>

        <div className="mb-4 w-full space-y-1 text-left">
          <p className="font-bold">
            BMI: <span style={{ color: '#7B95A9' }}>{bmi}</span>
          </p>
          <p className="font-bold">
            Current Weight: <span style={{ color: '#7B95A9' }}>{weight} lbs</span>
          </p>
          <p className="font-bold">
            Goal Weight: <span style={{ color: '#7B95A9' }}>{goalWeight} lbs</span> within{' '}
            <span style={{ color: '#7B95A9' }}>{weeksToGoal}</span> weeks
          </p>
        </div>

        <p className="mb-6 w-full text-left text-base" style={{ color: '#101010' }}>
          You are a <strong>strong candidate</strong> for medical weight loss with a{' '}
          <strong>94% chance</strong> of successful treatment if qualified.
        </p>

        <h2
          className="mb-6 text-center text-[1.25rem] font-bold sm:text-[1.5rem]"
          style={{ color: '#101010' }}
        >
          Let&apos;s proceed to check your eligibility
        </h2>

        <div className="mb-4 w-full space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: '#7B95A9' }}>
                First Name <span className="text-red-400">*</span>
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="wm-input"
              />
              {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: '#7B95A9' }}>
                Last Name <span className="text-red-400">*</span>
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="wm-input"
              />
              {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              What state will your medication be shipped to? <span className="text-red-400">*</span>
            </label>
            <select value={state} onChange={(e) => setState(e.target.value)} className="wm-select">
              <option value="">Select state</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {errors.state && <p className="mt-1 text-xs text-red-500">{errors.state}</p>}
          </div>
        </div>

        <p className="text-center text-sm" style={{ color: '#666' }}>
          Your information is never shared and is protected by HIPAA.
        </p>
      </div>

      <div className="mx-auto w-full max-w-[600px] px-6 pb-8 sm:mx-auto sm:max-w-[31rem] sm:px-8">
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
