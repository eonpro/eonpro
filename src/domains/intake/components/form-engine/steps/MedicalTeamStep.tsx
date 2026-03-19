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
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full h-1 bg-gray-200">
        <div 
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      
      {prevStep && (
        <div className="px-6 lg:px-8 pt-8 lg:pt-6">
          <button 
            onClick={handleBack}
            className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}
      
      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 pb-40 max-w-md lg:max-w-lg mx-auto w-full">
        <div className="space-y-6">
          <div 
            className={`flex justify-center transition-all duration-700 ease-out ${
              animate ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
          >
            <img 
              src="https://static.wixstatic.com/media/c49a9b_e3b5b1388aab4fb4b005bf6f54a54df4~mv2.webp"
              alt={isSpanish ? 'Equipo médico' : 'Medical team'}
              className="w-full max-w-md h-auto rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300"
            />
          </div>

          <div className="space-y-4">
            <h1 
              className={`page-title text-[#4ea77d] transition-all duration-700 ease-out ${
                animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
              style={{ transitionDelay: '200ms' }}
            >
              {isSpanish 
                ? 'Mensaje de nuestro equipo médico'
                : 'Message from our medical team'}
            </h1>

            <div className="space-y-4 text-gray-700">
              <p 
                className={`text-lg transition-all duration-700 ease-out ${
                  animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: '350ms' }}
              >
                {isSpanish
                  ? 'Si bien los medicamentos para perder peso son altamente efectivos, es común experimentar efectos secundarios como náuseas.'
                  : 'While weight loss medications are highly effective, it\'s common to experience side effects like nausea.'}
              </p>

              <p 
                className={`transition-all duration-700 ease-out ${
                  animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: '500ms' }}
              >
                {isSpanish
                  ? 'En EONMeds, un médico licenciado puede personalizar tu plan de tratamiento para ayudarte a alcanzar tus objetivos sin tener que lidiar con esos efectos.'
                  : 'At EONMeds, a licensed physician can customize your treatment plan to help you achieve your goals without having to deal with those effects.'}
              </p>

              <p 
                className={`transition-all duration-700 ease-out ${
                  animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
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
        className={`px-6 lg:px-8 pb-8 max-w-md lg:max-w-lg mx-auto w-full transition-all duration-700 ease-out ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '800ms' }}
      >
        <p className="copyright-text text-center">© 2026 EONPro, LLC. All rights reserved.<br/>Exclusive and protected process.</p>
      </div>
    </div>
  );
}
