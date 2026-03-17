'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

interface PersonalizedTreatmentStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function PersonalizedTreatmentStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: PersonalizedTreatmentStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const { markStepCompleted, setCurrentStep, setResponse } = useIntakeActions();
  const [selected, setSelected] = useState('');

  const handleSelect = (value: string) => {
    setSelected(value);
    setResponse('personalizedTreatmentInterest', value);
    setTimeout(() => {
      markStepCompleted('personalized-treatment');
      setCurrentStep(nextStep);
      router.push(`${basePath}/${nextStep}`);
    }, 150);
  };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col page-fade-in">
      <div className="w-full h-1 bg-gray-200">
        <div 
          className="h-full bg-[#f0feab] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      
      {prevStep && (
        <div className="px-6 lg:px-8 pt-6 max-w-md lg:max-w-2xl mx-auto w-full">
          <button 
            onClick={handleBack}
            className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}
      
      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 pb-40 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-8">
          <h1 className="page-title" style={{ lineHeight: '1.25' }}>
            {isSpanish 
              ? <>¿Te interesaría que tu proveedor considere un plan de <span style={{ backgroundColor: '#f2fdb4', padding: '0 2px', borderRadius: '2px' }}>tratamiento personalizado sin costo adicional</span> para ayudarte a manejar cualquier efecto secundario?</>
              : <>Would you be interested in having your provider consider a <span style={{ backgroundColor: '#f2fdb4', padding: '0 2px', borderRadius: '2px' }}>personalized treatment plan at no extra cost</span> to help you manage any side effects?</>}
          </h1>

          <div className="space-y-3">
            <button
              onClick={() => handleSelect('yes')}
              className={`w-full p-4 text-left rounded-2xl transition-all flex items-center ${
                selected === 'yes'
                  ? 'bg-[#f0feab] border border-[#4fa87f]'
                  : 'bg-white border border-gray-200'
              }`}
            >
              <div className={`w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center mr-3 transition-all ${
                selected === 'yes' ? 'bg-[#413d3d] border-[#413d3d]' : 'bg-white border-gray-300'
              }`}>
                {selected === 'yes' && (
                  <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span className="text-base lg:text-lg">
                {isSpanish ? 'Sí, por favor' : 'Yes, please'}
              </span>
            </button>

            <button
              onClick={() => handleSelect('no')}
              className={`w-full p-4 text-left rounded-2xl transition-all flex items-center ${
                selected === 'no'
                  ? 'bg-[#f0feab] border border-[#4fa87f]'
                  : 'bg-white border border-gray-200'
              }`}
            >
              <div className={`w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center mr-3 transition-all ${
                selected === 'no' ? 'bg-[#413d3d] border-[#413d3d]' : 'bg-white border-gray-300'
              }`}>
                {selected === 'no' && (
                  <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span className="text-base lg:text-lg">
                {isSpanish ? 'No, estoy bien' : "No, I'm ok"}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 pb-8 max-w-md lg:max-w-2xl mx-auto w-full">
        <p className="copyright-text text-center">© 2026 EONPro, LLC. All rights reserved.<br/>Exclusive and protected process.</p>
      </div>
    </div>
  );
}
