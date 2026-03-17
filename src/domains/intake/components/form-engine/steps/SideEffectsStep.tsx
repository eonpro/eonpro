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
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full h-1 bg-gray-100">
        <div 
          className="h-full bg-[#f0feab] transition-all duration-300"
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

      <div className="flex-1 flex flex-col items-center justify-center px-6 lg:px-8 py-8">
        <div className="max-w-md lg:max-w-lg w-full">
          <h1 className="text-3xl lg:text-4xl font-medium text-black leading-tight">
            {words.map((word, index) => (
              <span
                key={index}
                className={`inline-block mr-2 transition-all duration-500 ease-out ${
                  animate ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-4 blur-sm'
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
        className={`px-6 lg:px-8 pb-8 max-w-md lg:max-w-lg mx-auto w-full transition-all duration-700 ease-out ${
          showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <button
          onClick={handleNext}
          className="w-full py-4 px-8 rounded-full text-lg font-medium bg-black text-white 
            hover:bg-gray-900 hover:scale-[1.02] active:scale-[0.98]
            flex items-center justify-center space-x-3 transition-all duration-200
            relative overflow-hidden shine-button"
        >
          <span>{isSpanish ? 'Siguiente' : 'Next'}</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        
        <p className="copyright-text text-center mt-4">
          {isSpanish ? (
            <>© 2026 EONPro, LLC. Todos los derechos reservados.<br/>
            Proceso exclusivo y protegido. Copiar o reproducir<br/>
            sin autorización está prohibido.</>
          ) : (
            <>© 2026 EONPro, LLC. All rights reserved.<br/>
            Exclusive and protected process. Copying or reproduction<br/>
            without authorization is prohibited.</>
          )}
        </p>
      </div>
    </div>
  );
}
