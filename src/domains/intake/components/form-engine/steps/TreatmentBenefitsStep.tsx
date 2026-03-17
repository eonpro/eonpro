'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

interface TreatmentBenefitsStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function TreatmentBenefitsStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: TreatmentBenefitsStepProps) {
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
        markStepCompleted('treatment-benefits');
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

  const benefits = [
    {
      id: 'appetite',
      title: {
        es: 'Controla tu apetito',
        en: 'Control your appetite'
      },
      description: {
        es: 'Despídete del hambre y antojos',
        en: 'Say goodbye to hunger and cravings'
      },
      bgColor: 'bg-[#f7d06b]',
      image: 'https://static.wixstatic.com/media/c49a9b_b3c28fca89d5416a9f47ed2663230647~mv2.webp'
    },
    {
      id: 'digestion',
      title: {
        es: 'Mejor Digestión',
        en: 'Better Digestion'
      },
      description: {
        es: 'Te llenas más rápido y por más tiempo',
        en: 'Feel fuller faster and for longer'
      },
      bgColor: 'bg-[#4ea77d]',
      image: 'https://static.wixstatic.com/media/c49a9b_ea25d461f966422ca6f9a51a72b9e93b~mv2.webp'
    },
    {
      id: 'levels',
      title: {
        es: 'Niveles estables',
        en: 'Stable levels'
      },
      description: {
        es: 'Mantén tu nivel de azúcar bajo control',
        en: 'Keep your blood sugar under control'
      },
      bgColor: 'bg-[#b8e561]',
      image: 'https://static.wixstatic.com/media/c49a9b_d75d94d455584a6cb15d4faacf8011c7~mv2.webp'
    }
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full h-1 bg-gray-200">
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
      
      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 pb-40 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-6">
          <h1 
            className={`text-2xl lg:text-3xl font-semibold leading-tight text-black transition-all duration-700 ease-out ${
              animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {isSpanish 
              ? 'Nuestros tratamientos te ayudan de la siguiente manera'
              : 'Our treatments help you in the following ways'}
          </h1>

          <div className="space-y-4 md:space-y-5">
            {benefits.map((benefit, index) => (
              <div 
                key={benefit.id} 
                className={`${benefit.bgColor} rounded-3xl overflow-hidden transition-all duration-700 ease-out
                  hover:scale-[1.02] hover:shadow-lg cursor-pointer
                  ${animate ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
                style={{ transitionDelay: `${200 + index * 150}ms` }}
              >
                <div className="flex items-stretch min-h-[120px] lg:min-h-[140px]">
                  <div className="flex-1 p-4 lg:p-6 flex flex-col justify-center">
                    <h2 className="text-[20px] lg:text-[22px] font-semibold mb-1 text-black">
                      {isSpanish ? benefit.title.es : benefit.title.en}
                    </h2>
                    <p className="text-[16px] lg:text-[18px] text-gray-700 leading-tight">
                      {isSpanish ? benefit.description.es : benefit.description.en}
                    </p>
                  </div>
                  
                  <div 
                    className={`w-32 lg:w-48 flex-shrink-0 transition-transform duration-500 ease-out ${
                      animate ? 'scale-100' : 'scale-95'
                    }`}
                    style={{ transitionDelay: `${400 + index * 150}ms` }}
                  >
                    <img 
                      src={benefit.image}
                      alt={isSpanish ? benefit.title.es : benefit.title.en}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div 
        className={`px-6 lg:px-8 pb-8 max-w-md lg:max-w-2xl mx-auto w-full transition-all duration-700 ease-out ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '800ms' }}
      >
        <p className="copyright-text text-center">© 2026 EONPro, LLC. All rights reserved.<br/>Exclusive and protected process.</p>
      </div>
    </div>
  );
}
