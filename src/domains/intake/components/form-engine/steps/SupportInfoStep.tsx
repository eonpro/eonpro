'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface SupportInfoStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function SupportInfoStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: SupportInfoStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const [animate, setAnimate] = useState(false);
  const hasNavigated = useRef(false);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        markStepCompleted('support-info');
        setCurrentStep(nextStep);
        router.push(`${basePath}/${nextStep}`);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [basePath, nextStep, markStepCompleted, setCurrentStep, router]);

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

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

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 pb-40 lg:max-w-lg lg:px-8">
        <div
          className={`${isOt ? 'bg-[#f5ecd8]' : 'bg-[#f0feab]'} cursor-pointer space-y-3 overflow-hidden rounded-3xl p-6 pb-0 transition-all duration-700 ease-out hover:scale-[1.01] hover:shadow-lg ${animate ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-8 scale-95 opacity-0'}`}
        >
          <h2
            className={`text-xl font-medium text-black transition-all duration-500 ease-out ${
              animate ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ transitionDelay: '200ms' }}
          >
            {isSpanish ? '¿Sabías que' : 'Did you know that'}
          </h2>

          <div
            className={`flex justify-start transition-all duration-500 ease-out ${
              animate ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
            }`}
            style={{ transitionDelay: '300ms' }}
          >
            <img
              src={
                isOt
                  ? 'https://static.wixstatic.com/shapes/c49a9b_5139736743794db7af38c583595f06fb.svg'
                  : 'https://static.wixstatic.com/media/c49a9b_60568a55413d471ba85d995d7da0d0f2~mv2.png'
              }
              alt={isOt ? 'OT Mens Health' : 'EONMeds'}
              className="h-10 w-auto"
            />
          </div>

          <h3
            className={`text-xl font-medium leading-tight text-black transition-all duration-500 ease-out ${
              animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`}
            style={{ transitionDelay: '400ms' }}
          >
            {isSpanish
              ? 'Asigna un representante a tu caso para guiarte y apoyarte en cada paso.'
              : 'Assigns a representative to your case to guide and support you every step of the way.'}
          </h3>

          <p
            className={`text-sm text-gray-600 transition-all duration-500 ease-out ${
              animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`}
            style={{ transitionDelay: '500ms' }}
          >
            {isSpanish
              ? 'Sabemos que las cosas a veces pueden ser confusas, por eso estamos aquí para guiarte y apoyarte.'
              : "We know things can sometimes be confusing, which is why we're here to guide and support you."}
          </p>

          <div
            className={`-mb-6 -ml-6 mt-4 flex justify-start transition-all duration-700 ease-out ${
              animate ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
            }`}
            style={{ transitionDelay: '600ms' }}
          >
            <img
              src={
                isOt
                  ? 'https://static.wixstatic.com/media/c49a9b_9879012a71074e4fb38af2dceae07f7c~mv2.webp'
                  : 'https://static.wixstatic.com/media/c49a9b_2c49b136f5ec49c787b37346cca7f47b~mv2.webp'
              }
              alt="Customer Service Representative"
              className="h-auto w-80 object-contain"
            />
          </div>
        </div>
      </div>

      <div
        className={`mx-auto w-full max-w-md px-6 pb-8 transition-all duration-700 ease-out lg:max-w-lg lg:px-8 ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '800ms' }}
      >
        <p className="copyright-text mt-4 text-center">
          © 2026 EONPro, LLC. All rights reserved.
          <br />
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
