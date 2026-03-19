'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore, useIntakeActions } from '../../../store/intakeStore';

interface ReviewStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function ReviewStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: ReviewStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  
  const responses = useIntakeStore((state) => state.responses);
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  
  const [confirmed, setConfirmed] = useState(false);

  const currentWeight = parseInt(String(responses.currentWeight || '')) || 0;
  const heightFeet = parseInt(String(responses.heightFeet || '')) || 0;
  const heightInches = parseInt(String(responses.heightInches || '')) || 0;
  const totalInches = heightFeet * 12 + heightInches;
  const bmi = totalInches > 0 ? Math.round(((currentWeight / (totalInches * totalInches)) * 703) * 10) / 10 : 0;

  const handleContinue = () => {
    if (confirmed) {
      markStepCompleted('review');
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

  const reviewItems = [
    { label: isSpanish ? 'Nombre' : 'Name', value: `${String(responses.firstName || '')} ${String(responses.lastName || '')}`.trim() || '-' },
    { label: isSpanish ? 'Fecha de nacimiento' : 'Date of birth', value: String(responses.dob || '-') },
    { label: isSpanish ? 'Email' : 'Email', value: String(responses.email || '-') },
    { label: isSpanish ? 'Teléfono' : 'Phone', value: String(responses.phone || '-') },
    { label: isSpanish ? 'Estado' : 'State', value: String(responses.stateFull || responses.state || '-') },
    { label: isSpanish ? 'Peso actual' : 'Current weight', value: currentWeight ? `${currentWeight} lbs` : '-' },
    { label: isSpanish ? 'Altura' : 'Height', value: heightFeet ? `${heightFeet}'${heightInches}"` : '-' },
    { label: isSpanish ? 'IMC' : 'BMI', value: bmi ? bmi.toString() : '-' },
    { label: isSpanish ? 'Peso ideal' : 'Goal weight', value: responses.idealWeight ? `${String(responses.idealWeight)} lbs` : '-' },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
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

      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6 pb-48 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-6">
          <h1 className="page-title">
            {isSpanish ? 'Revisa tu información' : 'Review your information'}
          </h1>
          
          <p className="page-subtitle">
            {isSpanish 
              ? 'Por favor confirma que la información es correcta.'
              : 'Please confirm your information is correct.'}
          </p>
          
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            {reviewItems.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                <span className="text-sm text-[#413d3d]/70">{item.label}</span>
                <span className="text-sm font-medium text-[#413d3d]">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="flex items-start space-x-3">
            <button
              type="button"
              onClick={() => setConfirmed(!confirmed)}
              className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center ${
                confirmed ? 'bg-[#f0feab]' : 'bg-white'
              }`}
              style={{ border: '1.5px solid #413d3d' }}
            >
              {confirmed && (
                <svg className="w-3 h-3 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span 
              className="text-sm text-[#413d3d] cursor-pointer"
              onClick={() => setConfirmed(!confirmed)}
            >
              {isSpanish 
                ? 'Confirmo que la información proporcionada es precisa y verdadera.'
                : 'I confirm the information provided is accurate and truthful.'}
            </span>
          </div>
        </div>
      </div>

      <div className="sticky-bottom-button max-w-md lg:max-w-2xl mx-auto w-full">
        <button 
          onClick={handleContinue}
          disabled={!confirmed}
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
