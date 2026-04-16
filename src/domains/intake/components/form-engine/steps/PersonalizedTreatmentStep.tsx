'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore, useIntakeActions } from '../../../store/intakeStore';

interface PersonalizedTreatmentStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function PersonalizedTreatmentStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: PersonalizedTreatmentStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const { markStepCompleted, setCurrentStep, setResponse } = useIntakeActions();
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const [selected, setSelected] = useState('');

  const handleSelect = (value: string) => {
    setSelected(value);
    setResponse('personalizedTreatmentInterest', value);
    setTimeout(() => {
      markStepCompleted('personalized-treatment');
      setCurrentStep(nextStep);
      router.push(`${basePath}/${nextStep}`);
    }, 150);
  };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  return (
    <div className="page-fade-in flex min-h-screen flex-col bg-white">
      <div className="h-1 w-full bg-gray-200">
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

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 pb-40 lg:max-w-2xl lg:px-8">
        <div className="space-y-8">
          <h1 className="page-title" style={{ lineHeight: '1.25' }}>
            {isSpanish ? (
              <>
                ¿Te interesaría que tu proveedor considere un plan de{' '}
                <span
                  style={{
                    backgroundColor: isOt ? '#f5ecd8' : '#f2fdb4',
                    padding: '0 2px',
                    borderRadius: '2px',
                  }}
                >
                  tratamiento personalizado sin costo adicional
                </span>{' '}
                para ayudarte a manejar cualquier efecto secundario?
              </>
            ) : (
              <>
                Would you be interested in having your provider consider a{' '}
                <span
                  style={{
                    backgroundColor: isOt ? '#f5ecd8' : '#f2fdb4',
                    padding: '0 2px',
                    borderRadius: '2px',
                  }}
                >
                  personalized treatment plan at no extra cost
                </span>{' '}
                to help you manage any side effects?
              </>
            )}
          </h1>

          <div className="space-y-3">
            <button
              onClick={() => handleSelect('yes')}
              className={`flex w-full items-center rounded-2xl p-4 text-left transition-all ${
                selected === 'yes'
                  ? isOt
                    ? 'border border-[#cab172] bg-[#f5ecd8]'
                    : 'border border-[#4fa87f] bg-[#f0feab]'
                  : 'border border-gray-200 bg-white'
              }`}
            >
              <div
                className={`mr-3 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all ${
                  selected === 'yes' ? 'border-[#413d3d] bg-[#413d3d]' : 'border-gray-300 bg-white'
                }`}
              >
                {selected === 'yes' && (
                  <svg className="h-3 w-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <span className="text-base lg:text-lg">
                {isSpanish ? 'Sí, por favor' : 'Yes, please'}
              </span>
            </button>

            <button
              onClick={() => handleSelect('no')}
              className={`flex w-full items-center rounded-2xl p-4 text-left transition-all ${
                selected === 'no'
                  ? isOt
                    ? 'border border-[#cab172] bg-[#f5ecd8]'
                    : 'border border-[#4fa87f] bg-[#f0feab]'
                  : 'border border-gray-200 bg-white'
              }`}
            >
              <div
                className={`mr-3 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all ${
                  selected === 'no' ? 'border-[#413d3d] bg-[#413d3d]' : 'border-gray-300 bg-white'
                }`}
              >
                {selected === 'no' && (
                  <svg className="h-3 w-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <span className="text-base lg:text-lg">
                {isSpanish ? 'No, estoy bien' : "No, I'm ok"}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-6 pb-8 lg:max-w-2xl lg:px-8">
        <p className="copyright-text text-center">
          © 2026 EONPro, LLC. All rights reserved.
          <br />
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
