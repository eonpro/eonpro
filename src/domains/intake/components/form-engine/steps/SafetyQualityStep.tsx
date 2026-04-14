'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface SafetyQualityStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function SafetyQualityStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: SafetyQualityStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const hasNavigated = useRef(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        markStepCompleted('safety-quality');
        setCurrentStep(nextStep);
        router.push(`${basePath}/${nextStep}`);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [basePath, nextStep, markStepCompleted, setCurrentStep, router]);

  const handleClick = () => {
    if (!hasNavigated.current) {
      hasNavigated.current = true;
      markStepCompleted('safety-quality');
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
    <div className="flex min-h-screen flex-col bg-white" onClick={handleClick}>
      <div className="h-1 w-full bg-gray-200">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {prevStep && (
        <div className="px-6 pt-8 lg:px-8 lg:pt-6">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleBack();
            }}
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

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 pb-40 lg:max-w-2xl lg:px-8">
        <div
          className={`${isOt ? 'bg-[#f5ecd8]' : 'bg-[#e5fbab]'} cursor-pointer rounded-3xl p-6 transition-all duration-700 ease-out hover:shadow-xl md:p-8 ${animate ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        >
          <div className="flex flex-col space-y-6">
            <div className="space-y-4">
              <h1
                className={`text-2xl font-semibold leading-tight text-black transition-all duration-700 ease-out lg:text-3xl ${
                  animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{ transitionDelay: '200ms' }}
              >
                {isSpanish
                  ? 'Comprometidos con la seguridad y la máxima calidad en cada paso.'
                  : 'Committed to safety and the highest quality at every step.'}
              </h1>

              <p
                className={`text-base leading-relaxed text-gray-700 transition-all duration-700 ease-out lg:text-lg ${
                  animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{ transitionDelay: '350ms' }}
              >
                {isSpanish
                  ? isOt
                    ? "Optimize by OT Men's Health colabora con algunas de las mejores farmacias 503A licenciadas del país para elaborar tratamientos personalizados y seguros para ti."
                    : 'EONMeds colabora con algunas de las mejores farmacias 503A licenciadas del país para elaborar tratamientos personalizados y seguros para ti.'
                  : isOt
                    ? "Optimize by OT Men's Health collaborates with some of the best 503A licensed pharmacies in the country to develop personalized and safe treatments for you."
                    : 'EONMeds collaborates with some of the best 503A licensed pharmacies in the country to develop personalized and safe treatments for you.'}
              </p>
            </div>

            <div
              className={`mx-auto max-w-[260px] overflow-hidden rounded-2xl transition-all duration-700 ease-out ${
                animate ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
              }`}
              style={{ transitionDelay: '500ms' }}
            >
              <img
                src="https://static.wixstatic.com/media/c49a9b_08d4b9a9d0394b3a83c2284def597b09~mv2.webp"
                alt={isSpanish ? 'Farmacia de calidad' : 'Quality pharmacy'}
                className="h-auto w-full transition-transform duration-500 hover:scale-105"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className={`mx-auto w-full max-w-md px-6 pb-8 transition-all duration-700 ease-out lg:max-w-2xl lg:px-8 ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '700ms' }}
      >
        <p className="copyright-text text-center">
          © 2026 EONPro, LLC. All rights reserved.
          <br />
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
