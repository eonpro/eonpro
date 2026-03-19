'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface DateOfBirthStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function DateOfBirthStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: DateOfBirthStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  
  const responses = useIntakeStore((state) => state.responses);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();
  
  const [dob, setDob] = useState(String(responses.dob || ''));
  const [certified, setCertified] = useState(false);
  const [isOver18, setIsOver18] = useState(true);
  const [showDateError, setShowDateError] = useState(false);
  const [showAgeError, setShowAgeError] = useState(false);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    
    if (value.length >= 2) {
      const month = parseInt(value.slice(0, 2));
      if (month > 12) value = '12' + value.slice(2);
      else if (month < 1 && value.length === 2) value = '01' + value.slice(2);
    }
    
    if (value.length >= 4) {
      const month = parseInt(value.slice(0, 2));
      const day = parseInt(value.slice(2, 4));
      
      if (month === 2 && day > 29) {
        value = value.slice(0, 2) + '29' + value.slice(4);
      } else if ([4, 6, 9, 11].includes(month) && day > 30) {
        value = value.slice(0, 2) + '30' + value.slice(4);
      } else if (day > 31) {
        value = value.slice(0, 2) + '31' + value.slice(4);
      } else if (day < 1 && value.length === 4) {
        value = value.slice(0, 2) + '01' + value.slice(4);
      }
    }
    
    let formattedValue = value;
    if (value.length >= 2) {
      formattedValue = value.slice(0, 2) + '/' + value.slice(2);
    }
    if (formattedValue.length >= 5) {
      formattedValue = formattedValue.slice(0, 5) + '/' + formattedValue.slice(5, 9);
    }
    
    setDob(formattedValue);
    setShowDateError(false);
    setShowAgeError(false);
    
    if (formattedValue.length === 10) {
      const [month, day, year] = formattedValue.split('/').map(Number);
      const birthDate = new Date(year, month - 1, day);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        setIsOver18(age - 1 >= 18);
      } else {
        setIsOver18(age >= 18);
      }
    } else {
      setIsOver18(true);
    }
  };

  const handleContinue = () => {
    if (dob.length !== 10) {
      setShowDateError(true);
      return;
    }
    
    if (!isOver18) {
      setShowAgeError(true);
      return;
    }
    
    if (!certified) return;
    
    setResponse('dob', dob);
    
    markStepCompleted('dob');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
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
      
      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 pb-48 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="page-title">
              {isSpanish ? '¿Cuál es tu fecha de nacimiento?' : 'What is your date of birth?'}
            </h1>
            <p className="page-subtitle">
              {isSpanish 
                ? 'Esta información será verificada y protegida.'
                : 'This information will be verified and protected.'}
            </p>
          </div>
          
          <div className="space-y-6">
            <div>
              <input
                type="text"
                inputMode="numeric"
                placeholder={isSpanish ? 'MM/DD/AAAA' : 'MM/DD/YYYY'}
                value={dob}
                onChange={handleDateChange}
                maxLength={10}
                className={`input-field w-full ${
                  (showDateError && dob.length !== 10) || (showAgeError && !isOver18)
                    ? 'border-red-500'
                    : ''
                }`}
              />
              {showDateError && dob.length !== 10 && (
                <p className="text-red-500 text-sm mt-2">
                  {isSpanish 
                    ? 'Por favor, ingresa una fecha de nacimiento completa (MM/DD/AAAA)'
                    : 'Please enter a complete date of birth (MM/DD/YYYY)'}
                </p>
              )}
              {(dob.length === 10 && !isOver18 && showAgeError) && (
                <p className="text-red-500 text-sm mt-2">
                  {isSpanish
                    ? 'Debes tener al menos 18 años para continuar'
                    : 'You must be at least 18 years old to continue'}
                </p>
              )}
            </div>
            
            <div className="bg-[#f5f5f5] rounded-2xl p-5">
              <div className="flex items-start gap-4 cursor-pointer" onClick={() => setCertified(!certified)}>
                <button
                  type="button"
                  className="mt-0.5 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all border-2 border-gray-300"
                  style={{ backgroundColor: certified ? '#f0feab' : 'white' }}
                >
                  {certified && (
                    <svg className="w-4 h-4" fill="none" stroke="#413d3d" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className="text-[15px] text-[#413d3d] leading-relaxed">
                  {isSpanish ? 'Certifico que tengo 18 años o más' : 'I certify that I am 18 years or older'}
                </span>
              </div>
            </div>
            
            <p className="text-xs text-[#413d3d]/60">
              {isSpanish 
                ? 'Debes tener al menos 18 años para acceder a este servicio.'
                : 'You must be at least 18 years old to access this service.'}
            </p>
          </div>
        </div>
      </div>
      
      <div className="sticky-bottom-button max-w-md lg:max-w-2xl mx-auto w-full">
        <button 
          onClick={handleContinue}
          disabled={!(dob.length === 10 && certified && isOver18)}
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
