'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface WeightInputStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
  fieldId?: string;
  title?: { en: string; es: string };
  subtitle?: { en: string; es: string };
}

export default function WeightInputStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
  fieldId = 'idealWeight',
  title,
  subtitle,
}: WeightInputStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  
  const responses = useIntakeStore((state) => state.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  
  const [weight, setWeightLocal] = useState(responses[fieldId] || '');

  const titleText = title 
    ? (isSpanish ? title.es : title.en)
    : (isSpanish ? '¿Cuál es tu peso ideal?' : 'What is your ideal weight?');
  
  const subtitleText = subtitle
    ? (isSpanish ? subtitle.es : subtitle.en)
    : (isSpanish ? 'Este es el peso al que aspiras llegar.' : 'This is the weight you aspire to reach.');

  const handleContinue = () => {
    if (weight) {
      setResponse(fieldId, weight);
      
      markStepCompleted(fieldId === 'idealWeight' ? 'ideal-weight' : fieldId);
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
    <div className="min-h-screen bg-white flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-100">
        <div 
          className="h-full bg-[#f0feab] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      
      {prevStep && (
        <div className="px-6 lg:px-8 pt-6 max-w-md lg:max-w-2xl mx-auto w-full">
          <button onClick={handleBack} className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}
      
      <div className="flex-1 px-6 lg:px-8 py-8 pb-48 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="page-title">{titleText}</h1>
            <p className="page-subtitle">{subtitleText}</p>
          </div>
          
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder=""
              value={weight}
              onChange={(e) => setWeightLocal(e.target.value.replace(/[^0-9]/g, ''))}
              className="input-field w-full pr-12"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#413d3d]/60">lbs</span>
          </div>
        </div>
      </div>
      
      {/* Sticky bottom button */}
      <div className="sticky-bottom-button max-w-md lg:max-w-2xl mx-auto w-full">
        <button 
          onClick={handleContinue}
          disabled={!weight}
          className="continue-button"
        >
          <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        
        <div className="mt-6 text-center">
          <p className="copyright-text">
            {isSpanish ? (
              <>© 2026 EONPro, LLC. Todos los derechos reservados.<br/>Proceso exclusivo y protegido.</>
            ) : (
              <>© 2026 EONPro, LLC. All rights reserved.<br/>Exclusive and protected process.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
