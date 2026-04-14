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
    <div className="flex min-h-screen flex-col bg-white">
      {/* Progress bar */}
      <div className="h-1 w-full bg-gray-100">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Back button */}
      {prevStep && (
        <div className="mx-auto w-full max-w-md px-6 pt-6 lg:max-w-2xl lg:px-8">
          <button
            onClick={handleBack}
            className="-ml-2 inline-block rounded-lg p-2 hover:bg-gray-100"
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

      <div className="mx-auto w-full max-w-md flex-1 px-6 py-4 pb-48 lg:max-w-2xl lg:px-8">
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
            <div
              className={`${isOt ? 'bg-[#f5ecd8]' : 'bg-[#f0feab]'} flex h-[90px] items-center overflow-hidden rounded-2xl`}
            >
              <div className="flex h-full w-[72px] flex-shrink-0 items-end">
                <Image
                  src={
                    isOt
                      ? 'https://static.wixstatic.com/media/c49a9b_281a5dda355a45dd8278f9a350b85a9e~mv2.png'
                      : 'https://static.wixstatic.com/media/c49a9b_427c597844f246fa8df26446b6f5d59a~mv2.png'
                  }
                  alt="Healthcare professional"
                  width={72}
                  height={90}
                  className="object-contain object-bottom"
                />
              </div>
              <div className="flex flex-1 flex-col justify-center py-2 pr-4">
                <h3 className="mb-0.5 text-[16px] font-bold leading-tight">
                  {isSpanish ? 'Tu salud es nuestra prioridad' : 'Your health is our priority'}
                </h3>
                <p className="text-[14px] leading-snug text-[#413d3d]/70">
                  {isSpanish
                    ? 'Tratamientos seguros personalizados para ti'
                    : 'Safe treatments tailored just for you!'}
                </p>
              </div>
            </div>

            {/* Doctor Review Card */}
            <div
              className={`${isOt ? 'bg-[#e8dcc4]' : 'bg-[#e4fb74]'} flex h-[90px] items-center overflow-hidden rounded-2xl`}
            >
              <div className="flex h-full w-[72px] flex-shrink-0 items-end">
                <Image
                  src={
                    isOt
                      ? 'https://static.wixstatic.com/media/c49a9b_0b980de32c824bbe9b55082cc8c90476~mv2.webp'
                      : 'https://static.wixstatic.com/media/c49a9b_5e690e4cf43e4e769ef7d4e9f5691a5b~mv2.webp'
                  }
                  alt="Licensed medical provider"
                  width={72}
                  height={90}
                  className="object-contain object-bottom"
                />
              </div>
              <div className="flex flex-1 flex-col justify-center py-2 pr-4">
                <h3 className="mb-0.5 text-[16px] font-bold leading-tight">
                  {isSpanish ? 'Revisión médica confidencial' : 'Confidential medical review'}
                </h3>
                <p className="text-[14px] leading-snug text-[#413d3d]/70">
                  {isSpanish
                    ? 'Un proveedor autorizado revisará tus respuestas'
                    : 'A licensed provider will review your responses'}
                </p>
              </div>
            </div>
          </div>

          {/* Consent Section */}
          <div className="rounded-2xl bg-[#f5f5f5] p-5">
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => setAgreed(!agreed)}
                className={`mt-0.5 flex aspect-square flex-shrink-0 cursor-pointer items-center justify-center rounded transition-all ${
                  agreed ? 'border-[#413d3d] bg-[#413d3d]' : 'border-gray-300 bg-white'
                }`}
                style={{
                  width: 22,
                  height: 22,
                  minWidth: 22,
                  maxWidth: 22,
                  minHeight: 22,
                  maxHeight: 22,
                  border: agreed ? '2px solid #413d3d' : '2px solid #d1d5db',
                }}
              >
                {agreed && (
                  <svg
                    className="h-4 w-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <div
                className="cursor-pointer text-[13px] leading-tight text-[#413d3d]"
                onClick={() => setAgreed(!agreed)}
              >
                {isSpanish
                  ? 'Al marcar esta casilla, reconozco que he leído, entendido y acepto los '
                  : 'By clicking this box, I acknowledge that I have read, understood, and agree to the '}
                <a
                  href={
                    isOt
                      ? 'https://www.otmens.com/termsandconditions'
                      : 'https://www.eonmeds.com/termsandconditions'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#413d3d] underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isSpanish ? 'Términos de Uso' : 'Terms of Use'}
                </a>
                {isSpanish ? ', y entiendo y acepto la ' : ', and I understand and agree to the '}
                <a
                  href={
                    isOt
                      ? 'https://www.otmens.com/privacypolicy'
                      : 'https://www.eonmeds.com/privacypolicy'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#413d3d] underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isSpanish ? 'Política de Privacidad' : 'Privacy Policy'}
                </a>
                {', '}
                <a
                  href={
                    isOt
                      ? 'https://www.otmens.com/telehealthconsent'
                      : 'https://www.eonmeds.com/telehealthconsent'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#413d3d] underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isSpanish ? 'Consentimiento de Telesalud' : 'Telehealth Consent'}
                </a>
                {isSpanish ? ' y ' : ' and '}
                <a
                  href={
                    isOt
                      ? 'https://www.otmens.com/cancellationpolicy'
                      : 'https://www.eonmeds.com/cancellationpolicy'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#413d3d] underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isSpanish ? 'política de cancelación' : 'cancelation policy'}
                </a>
                .
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom button */}
      <div className="sticky-bottom-button mx-auto w-full max-w-md lg:max-w-2xl">
        <button onClick={handleContinue} disabled={!agreed} className="continue-button">
          <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="mt-6 text-center">
          <p className="copyright-text">
            {isSpanish ? (
              <>
                © 2026 EONPro, LLC. Todos los derechos reservados.
                <br />
                Proceso exclusivo y protegido.
              </>
            ) : (
              <>
                © 2026 EONPro, LLC. All rights reserved.
                <br />
                Exclusive and protected process.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
