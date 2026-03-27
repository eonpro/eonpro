'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface StateSelectStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const states = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];

const stateCodeMap: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
};

export default function StateSelectStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: StateSelectStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  
  const responses = useIntakeStore((state) => state.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  
  const [selectedState, setSelectedState] = useState(String(responses.state ?? ''));
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleContinue = () => {
    if (selectedState && termsAccepted) {
      const stateCode = stateCodeMap[String(selectedState)] || String(selectedState);
      setResponse('state', stateCode);
      setResponse('stateFull', selectedState);
      
      markStepCompleted('state');
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
      <div className="w-full h-1 bg-gray-100">
        <div 
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
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
      
      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 pb-48 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="page-title">
              {isSpanish ? '¿Cuál es tu estado de residencia?' : 'What state do you live in?'}
            </h1>
            <p className="page-subtitle">
              {isSpanish 
                ? 'Esto nos ayuda a asegurarnos de que puedas acceder a nuestros servicios de telesalud.'
                : 'This helps us make sure you can access our telehealth services.'}
            </p>
          </div>
          
          <div className="relative">
            <label className="block text-sm text-[#413d3d]/70 mb-2">
              {isSpanish ? 'Estado' : 'State'}
            </label>
            <div className="relative">
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="select-field w-full"
              >
                <option value="" disabled>
                  {isSpanish ? 'Selecciona tu estado' : 'Select your state'}
                </option>
                {states.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="bg-[#f5f5f5] rounded-2xl p-5">
            <div 
              className="flex items-start gap-4 cursor-pointer" 
              onClick={() => setTermsAccepted(!termsAccepted)}
            >
              <button
                type="button"
                className="mt-0.5 flex-shrink-0 aspect-square rounded flex items-center justify-center transition-all border-2 border-gray-300"
                style={{
                  width: 22, height: 22, minWidth: 22, maxWidth: 22, minHeight: 22, maxHeight: 22,
                  backgroundColor: termsAccepted ? 'var(--intake-selected-bg, #f0feab)' : 'white'
                }}
              >
                {termsAccepted && (
                  <svg className="w-4 h-4" fill="none" stroke="#413d3d" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <span className="text-[13px] text-[#413d3d] leading-tight">
                {isSpanish 
                  ? 'Acepto los Términos y Condiciones, el Consentimiento de Telesalud, y reconozco la Política de Privacidad.'
                  : 'I agree to the Terms and Conditions, Telehealth Consent, and acknowledge the Privacy Policy.'}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="sticky-bottom-button max-w-md lg:max-w-2xl mx-auto w-full">
        <button 
          onClick={handleContinue}
          disabled={!selectedState || !termsAccepted}
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
