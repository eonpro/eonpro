'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface ConsentStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function ConsentStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: ConsentStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const [agreed, setAgreed] = useState(false);
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const handleContinue = () => {
    if (agreed) {
      const timestamp = new Date().toISOString();
      
      setResponse('terms_of_use_accepted', true);
      setResponse('terms_of_use_accepted_at', timestamp);
      setResponse('consent_privacy_policy_accepted', true);
      setResponse('telehealth_consent_accepted', true);
      setResponse('cancellation_policy_accepted', true);
      
      markStepCompleted('consent');
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
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Back button */}
      {prevStep && (
        <div className="px-6 lg:px-8 pt-6 max-w-md lg:max-w-2xl mx-auto w-full">
          <button onClick={handleBack} className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 px-6 lg:px-8 py-4 pb-48 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-4">
          <div>
            <h1 className="page-title mb-2">
              {isSpanish 
                ? 'Este cuestionario nos ayuda a entender tu historial médico, estilo de vida y objetivos.'
                : 'This questionnaire helps us understand your medical history, lifestyle, and goals.'}
            </h1>
            <p className="page-subtitle text-sm leading-tight">
              {isSpanish
                ? 'Similar al formulario que llenas cuando visitas al médico. Recuerda: tus respuestas son privadas y serán revisadas por nuestro equipo médico.'
                : 'Similar to the form you fill out when you visit the doctor. Remember: your responses are private and will be reviewed by our medical team.'}
            </p>
          </div>

          <div className="space-y-2">
            {/* Health Priority Card */}
            <div className={`${isOt ? 'bg-[#f5ecd8]' : 'bg-[#f0feab]'} rounded-xl overflow-hidden flex h-[77px] relative`}>
              <div className="absolute left-0 top-0 bottom-0 w-[42px]">
                <Image
                  src={isOt
                    ? 'https://static.wixstatic.com/media/c49a9b_281a5dda355a45dd8278f9a350b85a9e~mv2.png'
                    : 'https://static.wixstatic.com/media/c49a9b_427c597844f246fa8df26446b6f5d59a~mv2.png'}
                  alt="Healthcare professional"
                  fill
                  sizes="42px"
                  className="object-cover"
                  style={{ objectPosition: 'center top' }}
                />
              </div>
              <div className="flex-1 flex flex-col justify-center pl-14 pr-4 py-1.5">
                <h3 className="font-bold text-[13px] leading-tight mb-0.5">
                  {isSpanish ? 'Tu salud es nuestra prioridad' : 'Your health is our priority'}
                </h3>
                <p className="text-[11px] leading-snug text-[#413d3d]/70">
                  {isSpanish
                    ? 'Tratamientos seguros personalizados para ti'
                    : 'Safe treatments tailored just for you!'}
                </p>
              </div>
            </div>

            {/* Doctor Review Card */}
            <div className={`${isOt ? 'bg-[#e8dcc4]' : 'bg-[#e4fb74]'} rounded-xl overflow-hidden flex h-[77px] relative`}>
              <div className="absolute left-0 top-0 bottom-0 w-[42px]">
                <Image
                  src={isOt
                    ? 'https://static.wixstatic.com/media/c49a9b_0b980de32c824bbe9b55082cc8c90476~mv2.webp'
                    : 'https://static.wixstatic.com/media/c49a9b_5e690e4cf43e4e769ef7d4e9f5691a5b~mv2.webp'}
                  alt="Licensed medical provider"
                  fill
                  sizes="42px"
                  className="object-cover"
                  style={{ objectPosition: 'center 30%' }}
                />
              </div>
              <div className="flex-1 flex flex-col justify-center pl-14 pr-4 py-1.5">
                <h3 className="font-bold text-[13px] leading-tight mb-0.5">
                  {isSpanish ? 'Revisión médica confidencial' : 'Confidential medical review'}
                </h3>
                <p className="text-[11px] leading-snug text-[#413d3d]/70">
                  {isSpanish
                    ? 'Un proveedor autorizado revisará tus respuestas'
                    : 'A licensed provider will review your responses'}
                </p>
              </div>
            </div>
          </div>

          {/* Consent Section */}
          <div className="bg-[#f5f5f5] rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => setAgreed(!agreed)}
                className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center cursor-pointer transition-all ${
                  agreed ? 'bg-[#413d3d] border-[#413d3d]' : 'bg-white border-gray-300'
                }`}
                style={{ border: agreed ? '2px solid #413d3d' : '2px solid #d1d5db' }}
              >
                {agreed && (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <div
                className="text-[13px] text-[#413d3d] leading-tight cursor-pointer"
                onClick={() => setAgreed(!agreed)}
              >
                {isSpanish ? 'Acepto los ' : 'I agree to the '}
                <a href="#" className="text-[#413d3d] underline" onClick={(e) => e.stopPropagation()}>
                  {isSpanish ? 'Términos de Uso' : 'Terms of Use'}
                </a>
                {isSpanish ? ' y la ' : ' and '}
                <a href="#" className="text-[#413d3d] underline" onClick={(e) => e.stopPropagation()}>
                  {isSpanish ? 'Política de Privacidad' : 'Privacy Policy'}
                </a>
                {', '}
                <a href="#" className="text-[#413d3d] underline" onClick={(e) => e.stopPropagation()}>
                  {isSpanish ? 'Consentimiento de Telesalud' : 'Telehealth Consent'}
                </a>
                {isSpanish ? ' y ' : ' and '}
                <a href="#" className="text-[#413d3d] underline" onClick={(e) => e.stopPropagation()}>
                  {isSpanish ? 'Política de Cancelación' : 'Cancellation Policy'}
                </a>.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom button */}
      <div className="sticky-bottom-button max-w-md lg:max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={!agreed}
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
