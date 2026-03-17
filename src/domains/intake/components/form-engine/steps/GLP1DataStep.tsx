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

export function GLP1DataStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: GLP1DataStepProps) {
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
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-[#413d3d]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col px-6 lg:px-8 pt-8 lg:pt-12 max-w-md lg:max-w-2xl mx-auto w-full pb-32">
      <div className="space-y-6">
        <h1 className="text-[22px] lg:text-[28px] font-semibold leading-tight text-[#413d3d]">
          {isSpanish
            ? 'Datos clínicos* indican que las dosis personalizadas de GLP-1 pueden ayudar a reducir los efectos secundarios sin comprometer los resultados.'
            : 'Clinical data* indicates that personalized GLP-1 dosing can help reduce side effects without compromising results.'}
        </h1>

        <div className="bg-[#f0feab] rounded-2xl p-6 space-y-4">
          <div className="text-center">
            <span className="text-5xl font-bold text-[#413d3d]">83%</span>
            <p className="text-[15px] text-[#413d3d] mt-2">
              {isSpanish
                ? 'de los pacientes con un enfoque de dosis individualizadas experimentaron efectos secundarios significativamente reducidos'
                : 'of patients with an individualized dosing approach experienced significantly reduced side effects'}
            </p>
          </div>

          <div className="text-center border-t border-[#d4e8a0] pt-4">
            <span className="text-5xl font-bold text-[#413d3d]">91%</span>
            <p className="text-[15px] text-[#413d3d] mt-2">
              {isSpanish
                ? 'de los pacientes lograron una pérdida de peso significativa con un programa de dosificación personalizado'
                : 'of patients achieved significant weight loss with a personalized dosing schedule'}
            </p>
          </div>
        </div>

        <p className="text-[12px] text-[#999] text-center">
          {isSpanish
            ? '*Basado en estudios clínicos publicados sobre la eficacia de GLP-1'
            : '*Based on published clinical studies on GLP-1 efficacy'}
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleContinue}
            className="w-full py-4 rounded-full text-[16px] font-semibold bg-[#413d3d] text-white hover:bg-[#2d2a2a] transition-all"
          >
            {isSpanish ? 'Continuar' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GLP1DataStep;
