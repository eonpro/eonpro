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
        en: 'Control your appetite',
      },
      description: {
        es: 'Despídete del hambre y antojos',
        en: 'Say goodbye to hunger and cravings',
      },
      bgColor: 'bg-[#f7d06b]',
      image: 'https://static.wixstatic.com/media/c49a9b_b3c28fca89d5416a9f47ed2663230647~mv2.webp',
    },
    {
      id: 'digestion',
      title: {
        es: 'Mejor Digestión',
        en: 'Better Digestion',
      },
      description: {
        es: 'Te llenas más rápido y por más tiempo',
        en: 'Feel fuller faster and for longer',
      },
      bgColor: 'bg-[#4ea77d]',
      image: 'https://static.wixstatic.com/media/c49a9b_ea25d461f966422ca6f9a51a72b9e93b~mv2.webp',
    },
    {
      id: 'levels',
      title: {
        es: 'Niveles estables',
        en: 'Stable levels',
      },
      description: {
        es: 'Mantén tu nivel de azúcar bajo control',
        en: 'Keep your blood sugar under control',
      },
      bgColor: 'bg-[#b8e561]',
      image: 'https://static.wixstatic.com/media/c49a9b_d75d94d455584a6cb15d4faacf8011c7~mv2.webp',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="h-1 w-full bg-gray-200">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {prevStep && (
        <div className="px-6 pt-8 lg:px-8 lg:pt-6">
          <button
            onClick={handleBack}
            className="-ml-2 inline-block rounded-lg p-2 transition-colors hover:bg-gray-100"
          >
            <svg
              className="h-6 w-6 text-[#413d3d]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 pb-40 lg:max-w-2xl lg:px-8">
        <div className="space-y-6">
          <h1
            className={`text-2xl font-semibold leading-tight text-black transition-all duration-700 ease-out lg:text-3xl ${
              animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
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
                className={`${benefit.bgColor} cursor-pointer overflow-hidden rounded-3xl transition-all duration-700 ease-out hover:scale-[1.02] hover:shadow-lg ${animate ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}`}
                style={{ transitionDelay: `${200 + index * 150}ms` }}
              >
                <div className="flex min-h-[120px] items-stretch lg:min-h-[140px]">
                  <div className="flex flex-1 flex-col justify-center p-4 lg:p-6">
                    <h2 className="mb-1 text-[20px] font-semibold text-black lg:text-[22px]">
                      {isSpanish ? benefit.title.es : benefit.title.en}
                    </h2>
                    <p className="text-[16px] leading-tight text-gray-700 lg:text-[18px]">
                      {isSpanish ? benefit.description.es : benefit.description.en}
                    </p>
                  </div>

                  <div
                    className={`w-32 flex-shrink-0 transition-transform duration-500 ease-out lg:w-48 ${
                      animate ? 'scale-100' : 'scale-95'
                    }`}
                    style={{ transitionDelay: `${400 + index * 150}ms` }}
                  >
                    <img
                      src={benefit.image}
                      alt={isSpanish ? benefit.title.es : benefit.title.en}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`mx-auto w-full max-w-md px-6 pb-8 transition-all duration-700 ease-out lg:max-w-2xl lg:px-8 ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '800ms' }}
      >
        <p className="copyright-text text-center">
          © 2026 EONPro, LLC. All rights reserved.
          <br />
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
