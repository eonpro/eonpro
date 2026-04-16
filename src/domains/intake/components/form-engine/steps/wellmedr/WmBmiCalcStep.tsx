'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmBmiCalcStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmBmiCalcStep({ basePath, nextStep, progressPercent }: WmBmiCalcStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const [feet, setFeet] = useState(String(responses.height_feet || responses.heightFeet || ''));
  const [inches, setInches] = useState(
    String(responses.height_inches || responses.heightInches || '')
  );
  const [weight, setWeight] = useState(
    String(responses.current_weight || responses.currentWeight || '')
  );

  const [errors, setErrors] = useState<{ feet?: string; inches?: string; weight?: string }>({});

  const handleContinue = () => {
    const newErrors: typeof errors = {};
    const feetNum = Number(feet);
    const inchesNum = Number(inches);
    const weightNum = Number(weight);

    if (!feet || feetNum < 3 || feetNum > 7) newErrors.feet = 'Feet must be between 3 and 7';
    if (inches === '' || inchesNum < 0 || inchesNum > 11)
      newErrors.inches = 'Inches must be between 0 and 11';
    if (!weight || weightNum < 50 || weightNum > 800) newErrors.weight = 'Enter a valid weight';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setResponse('current_weight', weight);
    setResponse('currentWeight', weight);
    setResponse('height_feet', feet);
    setResponse('heightFeet', feet);
    setResponse('height_inches', inches);
    setResponse('heightInches', inches);
    markStepCompleted('bmi-calc');
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
          opacity: 0.3;
          color: #101010;
          font-weight: 400;
          font-size: 1rem;
          line-height: 26px;
          letter-spacing: -0.01em;
        }
        @media (min-width: 640px) {
          .wm-input { height: 72px; font-size: 1.25rem; }
          .wm-input::placeholder { font-size: 1.125rem; line-height: 24px; }
        }
      `}</style>

      {/* Progress bar */}
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

      {/* Logo — centered */}
      <div
        className="mx-auto w-full max-w-[48rem] px-6 pt-4"
        style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s ease-out' }}
      >
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-6 pb-6 sm:px-8">
        {/* Title */}
        <h1
          className="mb-2 text-center text-[1.25rem] font-medium leading-[30px] sm:text-[2rem] sm:leading-[40px]"
          style={{
            color: '#101010',
            letterSpacing: '-0.02em',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(6px)',
            transition: 'all 0.3s ease-out 0.05s',
          }}
        >
          Let&rsquo;s calculate your BMI.
        </h1>
        <p
          className="mb-8 text-center text-base leading-relaxed sm:mb-10 sm:text-[1.25rem]"
          style={{
            color: '#101010',
            opacity: mounted ? 0.6 : 0,
            letterSpacing: '-0.01em',
            transition: 'opacity 0.3s ease 0.08s',
          }}
        >
          Body Mass Index (BMI) helps determine eligibility for weight loss medication and assess
          weight-related health risks.
        </p>

        {/* Fields */}
        <div
          className="w-full"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(4px)',
            transition: 'all 0.3s ease-out 0.1s',
          }}
        >
          {/* Feet + Inches — side by side */}
          <div className="mb-5 flex gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <label
                className="text-base font-medium leading-[26px] sm:text-[1.125rem] sm:leading-6"
                style={{ color: '#101010', letterSpacing: '-0.01em' }}
              >
                Feet <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="5"
                className="wm-input"
                style={errors.feet ? { borderColor: '#ef4444' } : undefined}
                value={feet}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  if (v === '' || (Number(v) >= 0 && Number(v) <= 7)) setFeet(v);
                  if (errors.feet) setErrors((prev) => ({ ...prev, feet: undefined }));
                }}
              />
              {errors.feet && (
                <span className="text-xs" style={{ color: '#ef4444' }}>
                  {errors.feet}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <label
                className="text-base font-medium leading-[26px] sm:text-[1.125rem] sm:leading-6"
                style={{ color: '#101010', letterSpacing: '-0.01em' }}
              >
                Inches <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="4"
                className="wm-input"
                style={errors.inches ? { borderColor: '#ef4444' } : undefined}
                value={inches}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  if (v === '' || (Number(v) >= 0 && Number(v) <= 11)) setInches(v);
                  if (errors.inches) setErrors((prev) => ({ ...prev, inches: undefined }));
                }}
              />
              {errors.inches && (
                <span className="text-xs" style={{ color: '#ef4444' }}>
                  {errors.inches}
                </span>
              )}
            </div>
          </div>

          {/* Weight */}
          <div className="flex flex-col gap-2">
            <label
              className="text-base font-medium leading-[26px] sm:text-[1.125rem] sm:leading-6"
              style={{ color: '#101010', letterSpacing: '-0.01em' }}
            >
              Weight (lbs) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="200"
              className="wm-input"
              style={errors.weight ? { borderColor: '#ef4444' } : undefined}
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value.replace(/[^0-9]/g, ''));
                if (errors.weight) setErrors((prev) => ({ ...prev, weight: undefined }));
              }}
            />
            {errors.weight && (
              <span className="text-xs" style={{ color: '#ef4444' }}>
                {errors.weight}
              </span>
            )}
          </div>
        </div>

        {/* Button */}
        <div
          className="mt-8 w-full sm:mx-auto sm:mt-[3.25rem] sm:max-w-[31rem]"
          style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s ease 0.12s' }}
        >
          <button
            onClick={handleContinue}
            className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full text-base font-normal text-white active:scale-[0.98] sm:text-[1.125rem]"
            style={{
              height: 56,
              backgroundColor: '#0C2631',
              transition: 'opacity 0.3s ease',
              cursor: 'pointer',
            }}
          >
            Next <span style={{ fontSize: '1em' }}>&#10132;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
