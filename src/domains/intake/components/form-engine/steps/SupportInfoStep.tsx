'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

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
      
      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 pb-40 max-w-md lg:max-w-lg mx-auto w-full">
        <div 
          className={`bg-[#f0feab] rounded-3xl p-6 pb-0 space-y-3 overflow-hidden 
            transition-all duration-700 ease-out cursor-pointer
            hover:shadow-lg hover:scale-[1.01]
            ${animate ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}`}
        >
          <h2 
            className={`text-xl font-medium text-black transition-all duration-500 ease-out ${
              animate ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ transitionDelay: '200ms' }}
          >
            {isSpanish ? '¿Sabías?' : 'Did you know?'}
          </h2>
          
          <div 
            className={`flex justify-start transition-all duration-500 ease-out ${
              animate ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
            }`}
            style={{ transitionDelay: '300ms' }}
          >
            <img 
              src="https://static.wixstatic.com/media/c49a9b_60568a55413d471ba85d995d7da0d0f2~mv2.png"
              alt="EONMeds"
              className="h-10 w-auto"
            />
          </div>
          
          <h3 
            className={`text-xl font-medium text-black leading-tight transition-all duration-500 ease-out ${
              animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '400ms' }}
          >
            {isSpanish 
              ? 'Te asigna un representante dedicado'
              : 'Assigns you a dedicated representative'}
          </h3>
          
          <p 
            className={`text-sm text-gray-600 transition-all duration-500 ease-out ${
              animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '500ms' }}
          >
            {isSpanish
              ? 'Un representante dedicado estará contigo durante todo tu tratamiento para guiarte en cada paso.'
              : 'A dedicated representative will be with you throughout your treatment to guide you every step of the way.'}
          </p>
          
          <div 
            className={`flex justify-start -ml-6 -mb-6 mt-4 transition-all duration-700 ease-out ${
              animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
            }`}
            style={{ transitionDelay: '600ms' }}
          >
            <img 
              src="https://static.wixstatic.com/media/c49a9b_2c49b136f5ec49c787b37346cca7f47b~mv2.webp"
              alt="Customer Service Representative"
              className="w-80 h-auto object-contain"
            />
          </div>
        </div>
      </div>
      
      <div 
        className={`px-6 lg:px-8 pb-8 max-w-md lg:max-w-lg mx-auto w-full transition-all duration-700 ease-out ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '800ms' }}
      >
        <p className="copyright-text text-center mt-4">
          © 2026 EONPro, LLC. All rights reserved.<br/>
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
