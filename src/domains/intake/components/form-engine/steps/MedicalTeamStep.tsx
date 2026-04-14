'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

interface MedicalTeamStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function MedicalTeamStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: MedicalTeamStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const [animate, setAnimate] = useState(false);
  const hasNavigated = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        markStepCompleted('medical-team');
        setCurrentStep(nextStep);
        router.push(`${basePath}/${nextStep}`);
      }
    }, 5000);
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
      <div className="h-1 w-full bg-gray-200">
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
        <div className="space-y-6">
          <div
            className={`flex justify-center transition-all duration-700 ease-out ${
              animate ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
          >
            <img
              src="https://static.wixstatic.com/media/c49a9b_e3b5b1388aab4fb4b005bf6f54a54df4~mv2.webp"
              alt={isSpanish ? 'Equipo médico' : 'Medical team'}
              className="h-auto w-full max-w-md rounded-2xl shadow-lg transition-shadow duration-300 hover:shadow-xl"
            />
          </div>

          <div className="space-y-4">
            <h1
              className={`page-title text-[#4ea77d] transition-all duration-700 ease-out ${
                animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              }`}
              style={{ transitionDelay: '200ms' }}
            >
              {isSpanish ? 'Mensaje de nuestro equipo médico' : 'Message from our medical team'}
            </h1>

            <div className="space-y-4 text-gray-700">
              <p
                className={`text-lg transition-all duration-700 ease-out ${
                  animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{ transitionDelay: '350ms' }}
              >
                {isSpanish
                  ? 'Si bien los medicamentos para perder peso son altamente efectivos, es común experimentar efectos secundarios como náuseas.'
                  : "While weight loss medications are highly effective, it's common to experience side effects like nausea."}
              </p>

              <p
                className={`transition-all duration-700 ease-out ${
                  animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{ transitionDelay: '500ms' }}
              >
                {isSpanish
                  ? 'En EONMeds, un médico licenciado puede personalizar tu plan de tratamiento para ayudarte a alcanzar tus objetivos sin tener que lidiar con esos efectos.'
                  : 'At EONMeds, a licensed physician can customize your treatment plan to help you achieve your goals without having to deal with those effects.'}
              </p>

              <p
                className={`transition-all duration-700 ease-out ${
                  animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{ transitionDelay: '650ms' }}
              >
                {isSpanish
                  ? 'Las siguientes preguntas permitirán a tu proveedor determinar el mejor enfoque clínico para ti.'
                  : 'The following questions will allow your provider to determine the best clinical approach for you.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`mx-auto w-full max-w-md px-6 pb-8 transition-all duration-700 ease-out lg:max-w-lg lg:px-8 ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '800ms' }}
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
