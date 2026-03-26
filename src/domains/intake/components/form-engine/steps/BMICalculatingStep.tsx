'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore } from '../../../store/intakeStore';

interface BMICalculatingStepProps {
  basePath: string;
  nextStep: string;
  autoAdvanceDelay?: number;
}

export default function BMICalculatingStep({
  basePath,
  nextStep,
  autoAdvanceDelay = 4000,
}: BMICalculatingStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const responses = useIntakeStore((state) => state.responses);
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const [firstName, setFirstName] = useState('there');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const hasNavigated = useRef(false);

  const isSpanish = language === 'es';
  
  const steps = isSpanish
    ? ['Analizando peso...', 'Calculando altura...', 'Procesando datos...', '¡Casi listo!']
    : ['Analyzing weight...', 'Calculating height...', 'Processing data...', 'Almost there!'];

  useEffect(() => {
    const name = responses.firstName;
    if (name) {
      setFirstName(String(name));
    }
  }, [responses.firstName]);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + 2;
      });
    }, 70);
    return () => clearInterval(progressInterval);
  }, []);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % steps.length);
    }, 900);
    return () => clearInterval(stepInterval);
  }, [steps.length]);

  useEffect(() => {
    const navigationTimer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        router.push(`${basePath}/${nextStep}`);
      }
    }, autoAdvanceDelay);
    return () => clearTimeout(navigationTimer);
  }, [router, basePath, nextStep, autoAdvanceDelay]);

  return (
    <div className={`min-h-screen ${isOt ? 'bg-gradient-to-b from-white via-[#f5ecd8] to-[#cab172]/30' : 'bg-gradient-to-b from-white via-[#e8f5d9] to-[#aed581]/30'} flex flex-col items-center justify-center px-6`}>
      <div className="max-w-md w-full text-center">
        <h1 className="text-[28px] lg:text-[32px] font-medium leading-tight mb-8">
          <span className="text-gray-400">
            {isSpanish ? 'Un momento' : 'One moment'}
          </span>{' '}
          <span className="text-[#413d3d] font-bold">{firstName}</span>
          <span className={`${isOt ? 'text-[#cab172]' : 'text-[#7cb342]'} font-bold animate-pulse`}>...</span>
        </h1>

        <div className="flex justify-center mb-8">
          <div className="relative w-44 h-44 lg:w-52 lg:h-52">
            <div className={`absolute inset-0 rounded-full ${isOt ? 'bg-gradient-to-r from-[#cab172]/20 to-[#f5ecd8]/40' : 'bg-gradient-to-r from-[#7cb342]/20 to-[#e8f5d9]/40'} animate-pulse`} />

            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={isOt ? '#f5ecd8' : '#e8f5d9'}
                strokeWidth="6"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="url(#gradient)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${progress * 2.83} 283`}
                className="transition-all duration-100"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={isOt ? '#cab172' : '#7cb342'} />
                  <stop offset="100%" stopColor={isOt ? '#f5ecd8' : '#aed581'} />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <span className={`text-4xl lg:text-5xl font-bold ${isOt ? 'text-[#cab172]' : 'text-[#7cb342]'}`}>{progress}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 h-6">
          <p className={`text-sm font-medium ${isOt ? 'text-[#cab172]' : 'text-[#7cb342]'} animate-pulse`}>
            {steps[currentStep]}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-[22px] lg:text-[26px] leading-tight text-gray-400">
            {isSpanish ? (isOt ? 'OT Mens está calculando' : 'EONPro está calculando') : (isOt ? 'OT Mens is calculating' : 'EONPro is calculating')}
          </p>
          <p className="text-[22px] lg:text-[26px] leading-tight">
            <span className="text-gray-400">
              {isSpanish ? 'tu ' : 'your '}
            </span>
            <span className={`text-transparent bg-clip-text bg-gradient-to-r ${isOt ? 'from-[#413d3d] to-[#cab172]' : 'from-[#413d3d] to-[#7cb342]'} font-bold`}>
              {isSpanish ? 'Índice de Masa Corporal' : 'Body Mass Index'}
            </span>
          </p>
          <p className="text-[22px] lg:text-[26px] leading-tight text-gray-400">
            ({isSpanish ? 'IMC' : 'BMI'})
          </p>
        </div>

        <div className="flex justify-center gap-2 mt-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${isOt ? 'bg-[#cab172]' : 'bg-[#7cb342]'}`}
              style={{
                animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-8px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
