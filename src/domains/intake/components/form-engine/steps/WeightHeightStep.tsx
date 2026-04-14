'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface WeightHeightStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WeightHeightStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WeightHeightStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';

  const responses = useIntakeStore((state) => state.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [currentWeight, setCurrentWeight] = useState(String(responses.currentWeight || ''));
  const [feet, setFeet] = useState(String(responses.heightFeet || ''));
  const [inches, setInches] = useState(String(responses.heightInches ?? ''));

  const handleContinue = () => {
    if (currentWeight && feet && inches !== '') {
      setResponse('currentWeight', currentWeight);
      setResponse('heightFeet', feet);
      setResponse('heightInches', inches);

      markStepCompleted('weight-height');
      setCurrentStep(nextStep);
      router.push(`${basePath}/${nextStep}`);
    }
  };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Progress bar */}
      <div className="h-1 w-full bg-gray-100">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {prevStep && (
        <div className="mx-auto w-full max-w-md px-6 pt-6 lg:max-w-2xl lg:px-8">
          <button
            onClick={handleBack}
            className="-ml-2 inline-block rounded-lg p-2 hover:bg-gray-100"
          >
            <svg
              className="h-6 w-6 text-[#413d3d]"
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
        </div>
      )}

      <div className="mx-auto w-full max-w-md flex-1 px-6 py-8 pb-48 lg:max-w-2xl lg:px-8">
        <div className="space-y-8">
          {/* Current Weight */}
          <div className="space-y-4">
            <h2 className="page-title">
              {isSpanish ? '¿Cuál es tu peso actual?' : 'What is your current weight?'}
            </h2>
            <p className="page-subtitle">
              {isSpanish ? 'Proporciona tu mejor estimación.' : 'Provide your best estimate.'}
            </p>

            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder=""
                value={currentWeight}
                onChange={(e) => setCurrentWeight(e.target.value.replace(/[^0-9]/g, ''))}
                className="input-field w-full pr-12"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#413d3d]/60">
                {isSpanish ? 'lbs' : 'lbs'}
              </span>
            </div>
          </div>

          {/* Height */}
          <div className="space-y-4">
            <h2 className="page-title">
              {isSpanish ? '¿Cuál es tu altura?' : 'What is your height?'}
            </h2>

            <div className="flex gap-3">
              {/* Feet dropdown */}
              <div className="relative flex-1">
                <select
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                  className="select-field w-full"
                >
                  <option value="" disabled>
                    {isSpanish ? 'Pies' : 'Feet'}
                  </option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                  <svg
                    className="h-5 w-5 text-[#413d3d]/60"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              {/* Inches dropdown */}
              <div className="relative flex-1">
                <select
                  value={inches}
                  onChange={(e) => setInches(e.target.value)}
                  className="select-field w-full"
                >
                  <option value="" disabled>
                    {isSpanish ? 'Pulgadas' : 'Inches'}
                  </option>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((inch) => (
                    <option key={inch} value={inch}>
                      {inch}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                  <svg
                    className="h-5 w-5 text-[#413d3d]/60"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom button */}
      <div className="sticky-bottom-button mx-auto w-full max-w-md lg:max-w-2xl">
        <button
          onClick={handleContinue}
          disabled={!currentWeight || !feet || inches === ''}
          className="continue-button"
        >
          <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="mt-6 text-center">
          <p className="copyright-text">
            {isSpanish ? (
              <>
                © 2026 EONPro, LLC. Todos los derechos reservados.
                <br />
                Proceso exclusivo y protegido.
              </>
            ) : (
              <>
                © 2026 EONPro, LLC. All rights reserved.
                <br />
                Exclusive and protected process.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
