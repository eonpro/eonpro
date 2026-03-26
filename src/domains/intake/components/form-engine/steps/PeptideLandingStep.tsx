'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

interface PeptideLandingStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function PeptideLandingStep({
  basePath,
  nextStep,
}: PeptideLandingStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const { markStepCompleted, setCurrentStep } = useIntakeActions();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleStart = () => {
    markStepCompleted('peptide-intro');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full h-1 bg-[#f5ecd8]" />

      <div className="flex-1 flex flex-col px-6 lg:px-8 pt-8 lg:pt-12 pb-6 max-w-md lg:max-w-2xl mx-auto w-full">
        {/* Logo */}
        <div
          className={`mb-6 transform transition-all duration-700 ease-out ${
            animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://static.wixstatic.com/shapes/c49a9b_5139736743794db7af38c583595f06fb.svg"
            alt="OT Mens Health"
            className="h-7 w-auto"
          />
        </div>

        {/* Headlines */}
        <div className="text-left mb-6">
          <h1
            className={`text-[28px] lg:text-[34px] font-semibold leading-tight transform transition-all duration-700 ease-out delay-150 ${
              animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ color: '#cab172' }}
          >
            {isSpanish
              ? 'Apoya el envejecimiento saludable y la recuperación.'
              : 'Support healthy aging and recovery.'}
          </h1>
          <h2
            className={`text-[28px] lg:text-[34px] font-semibold leading-tight mt-4 transform transition-all duration-700 ease-out ${
              animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ color: '#cab172', transitionDelay: '250ms' }}
          >
            {isSpanish
              ? 'Optimiza la regulación natural de tu cuerpo.'
              : "Optimize your body's natural regulation."}
          </h2>
        </div>

        {/* Description paragraphs */}
        <div className="space-y-5 mb-8">
          <p
            className={`text-[15px] lg:text-base leading-relaxed text-[#413d3d] transform transition-all duration-700 ease-out ${
              animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '350ms' }}
          >
            {isSpanish
              ? 'Power Up de OT Men\'s Health ayuda a determinar si la terapia con Sermorelin puede ser apropiada para ti evaluando tus síntomas, calidad de sueño, patrones de recuperación y estilo de vida general.'
              : "Power Up by OT Men's Health helps determine whether Sermorelin therapy may be appropriate for you by evaluating your symptoms, sleep quality, recovery patterns, and overall lifestyle."}
          </p>
          <p
            className={`text-[15px] lg:text-base leading-relaxed text-[#413d3d] transform transition-all duration-700 ease-out ${
              animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '450ms' }}
          >
            {isSpanish
              ? 'Sermorelin está diseñado para apoyar una mejor calidad de sueño, mantenimiento muscular, metabolismo de grasas, recuperación y equilibrio metabólico a largo plazo al trabajar con los procesos reguladores naturales de tu cuerpo.'
              : "Sermorelin is designed to support improved sleep quality, muscle maintenance, fat metabolism, recovery, and long-term metabolic balance by working with your body's natural regulatory processes."}
          </p>
        </div>
      </div>

      {/* Bottom section */}
      <div
        className={`px-6 lg:px-8 pb-8 max-w-md lg:max-w-2xl mx-auto w-full space-y-3 transform transition-all duration-700 ease-out ${
          animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
        }`}
        style={{ transitionDelay: '550ms' }}
      >
        <div className="mb-4">
          <p
            className="text-[11px] lg:text-[13px] leading-tight"
            style={{ fontWeight: 450, color: 'rgba(65, 61, 61, 0.6)' }}
          >
            {isSpanish
              ? 'Al hacer clic en "Comenzar", aceptas que Overtime Men\'s Health y EONPro pueden usar tus respuestas para personalizar tu experiencia y para otros propósitos de acuerdo con nuestra '
              : 'By clicking \u201cStart\u201d, you agree that Overtime Men\u2019s Health and EONPro may use your responses to personalize your experience and for other purposes in accordance with our '}
            <a
              href="https://www.otmens.com/privacypolicy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: 'rgba(65, 61, 61, 0.6)' }}
            >
              {isSpanish ? 'Política de Privacidad.' : 'Privacy Policy.'}
            </a>
            {' '}
            {isSpanish
              ? 'La información que proporciones se utilizará como parte de tu evaluación médica.'
              : 'The information you provide will be used as part of your medical evaluation.'}
          </p>
        </div>

        <button
          onClick={handleStart}
          className="continue-button shine-button w-full"
        >
          <span className="text-white">{isSpanish ? 'Comenzar' : 'Start'}</span>
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>

        <div className="mt-6 text-center" style={{ lineHeight: '1.2' }}>
          <p className="text-gray-400 text-[11px]">
            Copyright © 2025 Overtime Mens Health All Rights Reserved
            <br />
            powered by EONPro, LLC. Exclusive and protected process.
            <br />
            Copying or reproduction without authorization is prohibited.
          </p>
        </div>
      </div>
    </div>
  );
}
