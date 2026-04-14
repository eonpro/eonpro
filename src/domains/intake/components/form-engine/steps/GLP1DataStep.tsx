'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';

interface GLP1DataStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export function GLP1DataStep({ basePath, nextStep, prevStep, progressPercent }: GLP1DataStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleContinue = useCallback(() => {
    router.push(`${basePath}/${nextStep}`);
  }, [basePath, nextStep, router]);

  const handleBack = () => {
    if (prevStep) {
      router.push(`${basePath}/${prevStep}`);
    }
  };

  if (!mounted) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-[#413d3d]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-32 pt-8 lg:max-w-2xl lg:px-8 lg:pt-12">
      <div className="space-y-6">
        <h1 className="text-[22px] font-semibold leading-tight text-[#413d3d] lg:text-[28px]">
          {isSpanish
            ? 'Datos clínicos* indican que las dosis personalizadas de GLP-1 pueden ayudar a reducir los efectos secundarios sin comprometer los resultados.'
            : 'Clinical data* indicates that personalized GLP-1 dosing can help reduce side effects without compromising results.'}
        </h1>

        <div className="space-y-4 rounded-2xl bg-[#f0feab] p-6">
          <div className="text-center">
            <span className="text-5xl font-bold text-[#413d3d]">83%</span>
            <p className="mt-2 text-[15px] text-[#413d3d]">
              {isSpanish
                ? 'de los pacientes con un enfoque de dosis individualizadas experimentaron efectos secundarios significativamente reducidos'
                : 'of patients with an individualized dosing approach experienced significantly reduced side effects'}
            </p>
          </div>

          <div className="border-t border-[#d4e8a0] pt-4 text-center">
            <span className="text-5xl font-bold text-[#413d3d]">91%</span>
            <p className="mt-2 text-[15px] text-[#413d3d]">
              {isSpanish
                ? 'de los pacientes lograron una pérdida de peso significativa con un programa de dosificación personalizado'
                : 'of patients achieved significant weight loss with a personalized dosing schedule'}
            </p>
          </div>
        </div>

        <p className="text-center text-[12px] text-[#999]">
          {isSpanish
            ? '*Basado en estudios clínicos publicados sobre la eficacia de GLP-1'
            : '*Based on published clinical studies on GLP-1 efficacy'}
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent p-6">
        <div className="mx-auto max-w-md">
          <button
            onClick={handleContinue}
            className="w-full rounded-full bg-[#413d3d] py-4 text-[16px] font-semibold text-white transition-all hover:bg-[#2d2a2a]"
          >
            {isSpanish ? 'Continuar' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GLP1DataStep;
