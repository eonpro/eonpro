'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore } from '../../../store/intakeStore';

interface HealthImprovementsStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const OPTIONS = [
  { id: 'hair_regrowth', en: 'Hair regrowth', es: 'Crecimiento del cabello', icon: '💇' },
  { id: 'sexual_health', en: 'Sexual Health', es: 'Salud sexual', icon: '❤️' },
  {
    id: 'testosterone_support',
    en: 'Testosterone support',
    es: 'Soporte de testosterona',
    icon: '💪',
  },
  { id: 'muscle_fat', en: 'More muscle, less fat', es: 'Más músculo, menos grasa', icon: '🏋️' },
  { id: 'longevity', en: 'Longevity', es: 'Longevidad', icon: '🧬' },
  { id: 'none', en: 'None of these', es: 'Ninguno de estos', icon: '✕' },
] as const;

const T = {
  title: {
    en: "Aside from losing weight, is there another area of your health you'd like to improve?",
    es: 'Aparte de perder peso, ¿hay otra área de tu salud que te gustaría mejorar?',
  },
  selectOne: { en: 'Select all that apply', es: 'Selecciona todos los que apliquen' },
};

export default function HealthImprovementsStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: HealthImprovementsStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const setResponse = useIntakeStore((s) => s.setResponse);
  const responses = useIntakeStore((s) => s.responses);
  const isSpanish = language === 'es';

  const stored = responses.health_improvements;
  const initial = Array.isArray(stored) ? (stored as string[]) : [];
  const [selected, setSelected] = useState<string[]>(initial);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      if (id === 'none') return ['none'];
      const without = prev.filter((v) => v !== 'none');
      return without.includes(id) ? without.filter((v) => v !== id) : [...without, id];
    });
  }, []);

  const handleContinue = () => {
    if (selected.length === 0) return;
    setResponse('health_improvements', selected);
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
          <div>
            <h1 className="page-title">{isSpanish ? T.title.es : T.title.en}</h1>
            <p className="page-subtitle mt-2">{isSpanish ? T.selectOne.es : T.selectOne.en}</p>
          </div>

          <div className="space-y-3">
            {OPTIONS.map((opt) => {
              const isSelected = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => toggle(opt.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 px-5 py-4 text-left transition-all duration-200 ${
                    isSelected
                      ? 'bg-[var(--intake-accent,#cab172)]/10 border-[var(--intake-accent,#cab172)]'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className="flex-shrink-0 text-xl">{opt.icon}</span>
                  <span className="text-[15px] font-medium text-[#413d3d]">
                    {isSpanish ? opt.es : opt.en}
                  </span>
                  {isSelected && (
                    <svg
                      className="ml-auto h-5 w-5 flex-shrink-0 text-[var(--intake-accent,#cab172)]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sticky-bottom-button mx-auto w-full max-w-[480px] lg:max-w-[560px]">
        <button
          onClick={handleContinue}
          disabled={selected.length === 0}
          className="continue-button disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
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
