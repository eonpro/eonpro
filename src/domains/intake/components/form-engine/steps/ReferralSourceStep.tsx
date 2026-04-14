'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore } from '../../../store/intakeStore';

interface ReferralSourceStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const OPTIONS = [
  { id: 'instagram', en: 'Instagram', es: 'Instagram' },
  { id: 'facebook', en: 'Facebook', es: 'Facebook' },
  { id: 'friend_family', en: 'Friend/Family', es: 'Amigo/Familia' },
  { id: 'google', en: 'Google', es: 'Google' },
  { id: 'univision', en: 'Univision/Telemundo', es: 'Univision/Telemundo' },
  { id: 'youtube', en: 'Youtube', es: 'Youtube' },
  { id: 'tiktok', en: 'Tiktok', es: 'Tiktok' },
  { id: 'ot_rep', en: 'Overtime Representative', es: 'Representante de Overtime' },
] as const;

const REQUIRES_NAME = new Set(['friend_family', 'ot_rep']);

const T = {
  title: { en: 'How did you hear about Overtime?', es: '¿Cómo escuchaste sobre Overtime?' },
};

export default function ReferralSourceStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: ReferralSourceStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const setResponse = useIntakeStore((s) => s.setResponse);
  const isSpanish = language === 'es';

  const handleSelect = useCallback(
    (id: string) => {
      setResponse('referral_source', id);
      const fallback = nextStep || 'review';
      const target = REQUIRES_NAME.has(id) ? 'referral-name' : fallback;
      setTimeout(() => router.push(`${basePath}/${target}`), 150);
    },
    [basePath, nextStep, router, setResponse]
  );

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

          <div className="space-y-3">
            {OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                className="w-full rounded-2xl border-2 border-gray-200 bg-white px-5 py-4 text-left transition-all duration-200 hover:border-[var(--intake-accent,#cab172)]"
              >
                <span className="text-[15px] font-medium text-[#413d3d]">
                  {isSpanish ? opt.es : opt.en}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sticky-bottom-button mx-auto w-full max-w-[480px] lg:max-w-[560px]">
        <p className="copyright-text text-center">
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
