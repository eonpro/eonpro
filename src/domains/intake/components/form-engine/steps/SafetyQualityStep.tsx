'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

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
    <div className="min-h-screen bg-white flex flex-col" onClick={handleClick}>
      <div className="w-full h-1 bg-gray-200">
        <div 
          className="h-full bg-[#f0feab] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      
      {prevStep && (
        <div className="px-6 lg:px-8 pt-8 lg:pt-6">
          <button 
            onClick={(e) => { e.stopPropagation(); handleBack(); }} 
            className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 pb-40 max-w-md lg:max-w-2xl mx-auto w-full">
        <div 
          className={`bg-[#e5fbab] rounded-3xl p-6 md:p-8 transition-all duration-700 ease-out
            hover:shadow-xl cursor-pointer
            ${animate ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        >
          <div className="flex flex-col space-y-6">
            <div className="space-y-4">
              <h1 
                className={`text-2xl lg:text-3xl font-semibold leading-tight text-black transition-all duration-700 ease-out ${
                  animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: '200ms' }}
              >
                {isSpanish 
                  ? 'Comprometidos con la seguridad y la máxima calidad en cada paso.'
                  : 'Committed to safety and the highest quality at every step.'}
              </h1>
              
              <p 
                className={`text-base lg:text-lg text-gray-700 leading-relaxed transition-all duration-700 ease-out ${
                  animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: '350ms' }}
              >
                {isSpanish
                  ? 'EONMeds colabora con algunas de las mejores farmacias 503A licenciadas del país para elaborar tratamientos personalizados y seguros para ti.'
                  : 'EONMeds collaborates with some of the best 503A licensed pharmacies in the country to develop personalized and safe treatments for you.'}
              </p>
            </div>

            <div 
              className={`rounded-2xl overflow-hidden transition-all duration-700 ease-out ${
                animate ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
              }`}
              style={{ transitionDelay: '500ms' }}
            >
              <img 
                src="https://static.wixstatic.com/media/c49a9b_08d4b9a9d0394b3a83c2284def597b09~mv2.webp"
                alt={isSpanish ? 'Farmacia de calidad' : 'Quality pharmacy'}
                className="w-full h-auto hover:scale-105 transition-transform duration-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div 
        className={`px-6 lg:px-8 pb-8 max-w-md lg:max-w-2xl mx-auto w-full transition-all duration-700 ease-out ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '700ms' }}
      >
        <p className="copyright-text text-center">© 2026 EONPro, LLC. All rights reserved.<br/>Exclusive and protected process.</p>
      </div>
    </div>
  );
}
