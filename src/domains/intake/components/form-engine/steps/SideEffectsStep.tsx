'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

interface SideEffectsStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function SideEffectsStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: SideEffectsStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const [animate, setAnimate] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const animateTimer = setTimeout(() => setAnimate(true), 100);
    const buttonTimer = setTimeout(() => setShowButton(true), 800);
    return () => {
      clearTimeout(animateTimer);
      clearTimeout(buttonTimer);
    };
  }, []);

  const handleNext = () => {
    markStepCompleted('side-effects-info');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  const text = isSpanish
    ? 'Las náuseas, vómitos, estreñimiento y diarrea son efectos secundarios tempranos comunes de los medicamentos para perder peso.'
    : 'Nausea, vomiting, constipation, and diarrhea are common early side effects of weight loss medication.';

  const words = text.split(' ');

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="h-1 w-full bg-gray-100">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {prevStep && (
        <div className="px-6 pt-8 lg:px-8 lg:pt-6">
          <button
            onClick={handleBack}
            className="-ml-2 inline-block rounded-lg p-2 transition-colors hover:bg-gray-100"
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

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 lg:px-8">
        <div className="w-full max-w-md lg:max-w-lg">
          <h1 className="text-3xl font-medium leading-tight text-black lg:text-4xl">
            {words.map((word, index) => (
              <span
                key={index}
                className={`mr-2 inline-block transition-all duration-500 ease-out ${
                  animate ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-4 opacity-0 blur-sm'
                }`}
                style={{ transitionDelay: `${index * 40}ms` }}
              >
                {word}
              </span>
            ))}
          </h1>
        </div>
      </div>

      <div
        className={`mx-auto w-full max-w-md px-6 pb-8 transition-all duration-700 ease-out lg:max-w-lg lg:px-8 ${
          showButton ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        }`}
      >
        <button
          onClick={handleNext}
          className="shine-button relative flex w-full items-center justify-center space-x-3 overflow-hidden rounded-full bg-black px-8 py-4 text-lg font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:bg-gray-900 active:scale-[0.98]"
        >
          <span>{isSpanish ? 'Siguiente' : 'Next'}</span>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <p className="copyright-text mt-4 text-center">
          {isSpanish ? (
            <>
              © 2026 EONPro, LLC. Todos los derechos reservados.
              <br />
              Proceso exclusivo y protegido. Copiar o reproducir
              <br />
              sin autorización está prohibido.
            </>
          ) : (
            <>
              © 2026 EONPro, LLC. All rights reserved.
              <br />
              Exclusive and protected process. Copying or reproduction
              <br />
              without authorization is prohibited.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
