'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore } from '../../../store/intakeStore';

interface ReferralNameStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const T = {
  title: {
    en: "What's the name of the person who referred you?",
    es: '¿Cuál es el nombre de la persona que te refirió?',
  },
  placeholder: { en: 'Enter their name', es: 'Ingresa su nombre' },
  skip: { en: 'Skip', es: 'Omitir' },
};

export default function ReferralNameStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: ReferralNameStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const setResponse = useIntakeStore((s) => s.setResponse);
  const responses = useIntakeStore((s) => s.responses);
  const isSpanish = language === 'es';

  const [name, setName] = useState((responses.referrer_name as string) || '');

  const handleContinue = () => {
    setResponse('referrer_name', name.trim());
    setResponse('referrer_type', responses.referral_source as string);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleBack = () => {
    if (prevStep) router.push(`${basePath}/${prevStep}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="h-1 w-full bg-gray-100">
        <div
          className="h-full bg-[var(--intake-accent,#cab172)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {prevStep && (
        <div className="mx-auto w-full max-w-[480px] px-6 pt-6 lg:max-w-[560px] lg:px-8">
          <button
            onClick={handleBack}
            className="-ml-2 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-6 py-8 lg:max-w-[560px] lg:px-8">
        <div className="space-y-8">
          <h1 className="page-title">{isSpanish ? T.title.es : T.title.en}</h1>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isSpanish ? T.placeholder.es : T.placeholder.en}
            className="w-full rounded-2xl border-2 border-gray-200 px-5 py-4 text-[15px] text-[#413d3d] outline-none transition-colors focus:border-[var(--intake-accent,#cab172)] focus:ring-0"
            autoFocus
          />
        </div>
      </div>

      <div className="sticky-bottom-button mx-auto w-full max-w-[480px] space-y-3 lg:max-w-[560px]">
        <button onClick={handleContinue} className="continue-button">
          <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {!name.trim() && (
          <button
            onClick={handleContinue}
            className="w-full py-3 text-sm font-medium text-gray-400 transition-colors hover:text-gray-600"
          >
            {isSpanish ? T.skip.es : T.skip.en}
          </button>
        )}
        <p className="copyright-text mt-4 text-center">
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
  );
}
