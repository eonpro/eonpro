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
  prevStep,
  progressPercent,
}: ReferralSourceStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const setResponse = useIntakeStore((s) => s.setResponse);
  const isSpanish = language === 'es';

  const handleSelect = useCallback((id: string) => {
    setResponse('referral_source', id);
    const target = REQUIRES_NAME.has(id) ? 'referral-name' : 'health-improvements';
    setTimeout(() => router.push(`${basePath}/${target}`), 150);
  }, [basePath, router, setResponse]);

  const handleBack = () => {
    if (prevStep) router.push(`${basePath}/${prevStep}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full h-1 bg-gray-100">
        <div
          className="h-full bg-[var(--intake-accent,#cab172)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {prevStep && (
        <div className="px-6 lg:px-8 pt-6 max-w-[480px] lg:max-w-[560px] mx-auto w-full">
          <button onClick={handleBack} className="inline-flex items-center gap-2 py-2 px-4 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 max-w-[480px] lg:max-w-[560px] mx-auto w-full">
        <div className="space-y-8">
          <h1 className="page-title">{isSpanish ? T.title.es : T.title.en}</h1>

          <div className="space-y-3">
            {OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                className="w-full text-left px-5 py-4 rounded-2xl border-2 border-gray-200 hover:border-[var(--intake-accent,#cab172)] bg-white transition-all duration-200"
              >
                <span className="text-[15px] font-medium text-[#413d3d]">
                  {isSpanish ? opt.es : opt.en}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sticky-bottom-button max-w-[480px] lg:max-w-[560px] mx-auto w-full">
        <p className="copyright-text text-center">
          {isSpanish ? (
            <>© 2026 EONPro, LLC. Todos los derechos reservados.<br/>Proceso exclusivo y protegido.</>
          ) : (
            <>© 2026 EONPro, LLC. All rights reserved.<br/>Exclusive and protected process.</>
          )}
        </p>
      </div>
    </div>
  );
}
