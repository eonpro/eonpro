'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore, useIntakeActions } from '../../../store/intakeStore';

interface FindingProviderStepProps {
  basePath: string;
  nextStep: string;
  autoAdvanceDelay?: number;
}

export default function FindingProviderStep({
  basePath,
  nextStep,
  autoAdvanceDelay = 4000,
}: FindingProviderStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const responses = useIntakeStore((state) => state.responses);
  const { setResponse } = useIntakeActions();
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [stateName, setStateName] = useState('your area');
  const [providersFound, setProvidersFound] = useState(0);
  const hasNavigated = useRef(false);
  const hasSubmitted = useRef(false);

  const isSpanish = language === 'es';
  
  const steps = isSpanish
    ? ['Enviando información...', 'Buscando proveedores...', 'Validando credenciales...', '¡Proveedor encontrado!']
    : ['Submitting information...', 'Searching providers...', 'Validating credentials...', 'Provider found!'];

  const submitToBackend = useCallback(async () => {
    if (hasSubmitted.current) return;
    hasSubmitted.current = true;
    setResponse('qualified', true);
  }, [setResponse]);

  useEffect(() => {
    const stateValue = responses.state;
    if (stateValue) {
      const stateNames: Record<string, string> = {
        'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
        'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
        'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
        'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
        'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
        'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
        'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
        'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
        'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
        'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
      };
      setStateName(stateNames[String(stateValue)] || String(stateValue) || 'your area');
    }
    submitToBackend();
  }, [responses.state, submitToBackend]);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + 1.5;
      });
    }, 50);
    return () => clearInterval(progressInterval);
  }, []);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev < steps.length - 1) return prev + 1;
        return prev;
      });
    }, 900);
    return () => clearInterval(stepInterval);
  }, [steps.length]);

  useEffect(() => {
    const counterInterval = setInterval(() => {
      setProvidersFound(prev => {
        if (prev >= 12) return 12;
        return prev + 1;
      });
    }, 250);
    return () => clearInterval(counterInterval);
  }, []);

  useEffect(() => {
    const navigationTimer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        router.push(`${basePath}/${nextStep}`);
      }
    }, autoAdvanceDelay);
    return () => clearTimeout(navigationTimer);
  }, [router, basePath, nextStep, autoAdvanceDelay]);

  return (
    <div className={`min-h-screen ${isOt ? 'bg-gradient-to-b from-white via-[#f5ecd8] to-[#cab172]/30' : 'bg-gradient-to-b from-white via-[#e8f5d9] to-[#aed581]/30'} flex flex-col items-center justify-center px-6`}>
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 w-32 h-32 -m-4">
              <div className={`absolute inset-0 rounded-full ${isOt ? 'bg-[#cab172]/20' : 'bg-[#7cb342]/20'} animate-ping`} style={{ animationDuration: '2s' }} />
              <div className={`absolute inset-2 rounded-full ${isOt ? 'bg-[#cab172]/30' : 'bg-[#7cb342]/30'} animate-ping`} style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
            </div>

            <div className={`relative w-24 h-24 bg-gradient-to-br ${isOt ? 'from-[#cab172] to-[#f5ecd8]' : 'from-[#7cb342] to-[#aed581]'} rounded-full flex items-center justify-center shadow-lg`}>
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>

              {progress >= 100 && (
                <div className="absolute inset-0 bg-green-500 rounded-full flex items-center justify-center animate-scale-in">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>

        <h1 className="text-[24px] lg:text-[28px] font-semibold text-[#413d3d] mb-2">
          {isSpanish ? 'Buscando un proveedor' : 'Finding a licensed provider'}
        </h1>
        <p className={`text-[20px] lg:text-[24px] ${isOt ? 'text-[#cab172]' : 'text-[#7cb342]'} font-medium mb-8`}>
          {isSpanish ? `en ${stateName}` : `in ${stateName}`}
        </p>

        <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full bg-gradient-to-r ${isOt ? 'from-[#cab172] to-[#f5ecd8]' : 'from-[#7cb342] to-[#aed581]'} rounded-full transition-all duration-100`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className={`text-sm font-medium ${isOt ? 'text-[#cab172]' : 'text-[#7cb342]'} mb-6 h-5`}>
          {steps[currentStep]}
        </p>

        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-16 h-20 rounded-xl transition-all duration-500 flex flex-col items-center justify-center ${
                providersFound > i * 4 ? (isOt ? 'bg-[#f5ecd8] scale-100 opacity-100' : 'bg-[#e8f5d9] scale-100 opacity-100') : 'bg-gray-100 scale-90 opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full mb-1 flex items-center justify-center transition-all ${
                providersFound > i * 4 ? (isOt ? 'bg-[#cab172]' : 'bg-[#7cb342]') : 'bg-gray-300'
              }`}>
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              {providersFound > i * 4 && (
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          ))}
        </div>

        <div className="text-center mb-6">
          <span className={`text-3xl font-bold ${isOt ? 'text-[#cab172]' : 'text-[#7cb342]'}`}>{providersFound}</span>
          <span className="text-gray-500 ml-2">
            {isSpanish ? 'proveedores disponibles' : 'providers available'}
          </span>
        </div>

        <p className="text-sm text-gray-500 mb-3">
          {isSpanish ? 'conectando via' : 'connecting via'}
        </p>
        <div className="flex justify-center mb-6">
          <img
            src="https://static.wixstatic.com/shapes/c49a9b_f5e1ceda9f1341bc9e97cc0a6b4d19a3.svg"
            alt="MedLink"
            className="h-10"
          />
        </div>

        <div className="flex justify-center gap-2 mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${isOt ? 'bg-[#cab172]' : 'bg-[#7cb342]'}`}
              style={{
                animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-8px); opacity: 1; }
        }
        @keyframes scale-in {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
