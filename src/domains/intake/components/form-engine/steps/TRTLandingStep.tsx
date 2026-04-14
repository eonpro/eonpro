'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

interface TRTLandingStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function TRTLandingStep({ basePath, nextStep }: TRTLandingStepProps) {
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
    markStepCompleted('trt-intro');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="h-[5px] w-full rounded-full bg-[#f5ecd8]" />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-6 pt-8 lg:max-w-2xl lg:px-8 lg:pt-12">
        {/* Logo + Lottie */}
        <div className="mb-4 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://static.wixstatic.com/shapes/c49a9b_5139736743794db7af38c583595f06fb.svg"
            alt="OT Mens Health"
            className="h-7 w-auto"
          />
          <div className="h-[70px] w-[70px] overflow-hidden">
            <iframe
              src="https://lottie.host/embed/34070443-ae33-4f25-b944-452a94704677/Ol2wOdhexp.lottie"
              style={{ width: '70px', height: '70px', border: 'none', background: 'transparent' }}
              title="OT Mens Health animation"
            />
          </div>
        </div>

        {/* Doctor photo */}
        <div
          className={`mb-4 transform transition-all duration-700 ease-out ${animate ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-5 scale-95 opacity-0'}`}
        >
          <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-[#cab172]/20">
            <Image
              src="https://static.wixstatic.com/media/c49a9b_5b9a0976f96044ccbf05c4d90c382f2d~mv2.webp"
              alt="Healthcare professional"
              fill
              sizes="128px"
              className="object-cover"
              priority
            />
          </div>
        </div>

        {/* Headline */}
        <div className="mb-6 text-left">
          <h1
            className={`page-title transform transition-all delay-150 duration-700 ease-out ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
            style={{ color: '#cab172' }}
          >
            {isSpanish ? (
              <>
                Recupera tu energía,
                <br />
                impulso y vitalidad.
              </>
            ) : (
              <>
                Restore your energy,
                <br />
                drive and vitality.
              </>
            )}
          </h1>
          <p
            className={`page-subtitle mt-3 transform leading-tight transition-all delay-300 duration-700 ease-out ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
          >
            {isSpanish ? (
              <>
                Descubre si la Terapia de Reemplazo de
                <br />
                Testosterona es adecuada para ti.
              </>
            ) : (
              <>
                See if Testosterone Replacement Therapy
                <br />
                is right for you.
              </>
            )}
          </p>
        </div>

        {/* Trust section */}
        <div className="space-y-3">
          <p
            className={`transform text-[15px] font-medium text-[#413d3d] transition-all delay-500 duration-700 ease-out ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
          >
            {isSpanish
              ? 'Confiado por más de 10,000+ pacientes'
              : 'Trusted by over 10,000+ patients'}
          </p>

          <div
            className={`flex transform -space-x-3 transition-all duration-700 ease-out ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
            style={{ transitionDelay: '600ms' }}
          >
            <Image
              src="https://static.wixstatic.com/media/c49a9b_e11bf27141fa4676b7c9d9f2438b334a~mv2.webp"
              alt="Happy patients"
              width={150}
              height={48}
              className="rounded-lg"
              priority
            />
          </div>

          <div
            className={`flex transform items-center transition-all duration-700 ease-out ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
            style={{ transitionDelay: '700ms' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://static.wixstatic.com/shapes/c49a9b_ea75afc771f74c108742b781ab47157d.svg"
              alt="Rated 4.9/5 based on verified reviews"
              width={200}
              height={50}
              className="object-contain"
            />
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div
        className={`mx-auto w-full max-w-md transform space-y-3 px-6 pb-8 transition-all duration-700 ease-out lg:max-w-2xl lg:px-8 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}
        style={{ transitionDelay: '800ms' }}
      >
        <div className="mb-4">
          <p
            className="text-[11px] leading-tight lg:text-[13px]"
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
            </a>{' '}
            {isSpanish
              ? 'La información que proporciones se utilizará como parte de tu evaluación médica.'
              : 'The information you provide will be used as part of your medical evaluation.'}
          </p>
        </div>

        <button onClick={handleStart} className="continue-button shine-button w-full">
          <span>{isSpanish ? 'Comenzar' : 'Start'}</span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="mt-6 text-center" style={{ lineHeight: '1.2' }}>
          <p className="text-[11px] font-medium text-gray-400">
            {isSpanish
              ? 'Formulario médico seguro conforme a HIPAA'
              : 'HIPAA-Secured Medical Intake'}
          </p>
          <p className="text-[11px] text-gray-400">
            © 2026 EONPro, LLC. All rights reserved.
            <br />
            Exclusive and protected process. Copying or reproduction without authorization is
            prohibited.
          </p>
        </div>
      </div>
    </div>
  );
}
