'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeStore } from '../../../store/intakeStore';
import { useLanguage } from '../../../contexts/LanguageContext';

interface MedicalHistoryOverviewStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export function MedicalHistoryOverviewStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: MedicalHistoryOverviewStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const responses = useIntakeStore((state) => state.responses);
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const isSpanish = language === 'es';
  const [mounted, setMounted] = useState(false);
  const hasNavigated = useRef(false);

  const [showDoctor, setShowDoctor] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showStep1, setShowStep1] = useState(false);
  const [showStep2, setShowStep2] = useState(false);
  const [showStep3, setShowStep3] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const timers = [
      setTimeout(() => setShowDoctor(true), 100),
      setTimeout(() => setShowTitle(true), 300),
      setTimeout(() => setShowStep1(true), 500),
      setTimeout(() => setShowStep2(true), 700),
      setTimeout(() => setShowStep3(true), 900),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    const timer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        router.push(`${basePath}/${nextStep}`);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [mounted, basePath, nextStep, router]);

  const handleBack = () => {
    if (prevStep) {
      router.push(`${basePath}/${prevStep}`);
    } else {
      router.back();
    }
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="animate-pulse text-[#413d3d]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-white">
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
            ></path>
          </svg>
        </button>
      </div>

      {!isOt && (
        <div className="relative mx-auto flex w-full max-w-md items-center justify-between px-6 lg:max-w-lg lg:px-8">
          <div className="relative h-14 w-14">
            <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 opacity-60 blur-md"></div>
            <div
              className="absolute inset-1 rounded-full bg-gradient-to-br from-cyan-300 via-blue-400 to-purple-500"
              style={{ animation: 'spin-slow 8s linear infinite' }}
            ></div>
            <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-white/80 to-transparent"></div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-md flex-1 px-6 py-8 lg:max-w-lg lg:px-8">
        <div className="space-y-8">
          <div
            className={`flex justify-start transition-all duration-700 ease-out ${
              showDoctor
                ? 'translate-y-0 scale-100 opacity-100'
                : 'translate-y-8 scale-90 opacity-0'
            }`}
          >
            <img
              src={
                isOt
                  ? 'https://static.wixstatic.com/media/c49a9b_5b7eb6087f204fb488efae8b63ec6f5f~mv2.webp'
                  : 'https://static.wixstatic.com/media/c49a9b_7742352092de4c8e82b9e6e10cc20719~mv2.webp'
              }
              alt="Medical Professional"
              className="h-[6.5rem] w-[6.5rem] object-contain"
            />
          </div>

          <div
            className={`text-left transition-all delay-100 duration-700 ease-out ${
              showTitle ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            <h1 className="page-title">
              {isSpanish ? (
                <>
                  Ahora, completa tu
                  <br />
                  historial médico
                </>
              ) : (
                <>
                  Now, complete your
                  <br />
                  medical history
                </>
              )}
            </h1>
          </div>

          <div className="relative">
            <div
              className={`absolute left-[11px] top-3 w-[2px] bg-gradient-to-b from-gray-300 ${isOt ? 'via-[#cab172]' : 'via-[#4fa87f]'} to-gray-200 transition-all duration-1000 ease-out ${
                showStep3 ? 'bottom-3' : 'bottom-full'
              }`}
            ></div>

            <div
              className={`relative flex items-center gap-4 pb-6 transition-all duration-500 ease-out ${
                showStep1 ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'
              }`}
            >
              <div className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300 bg-white shadow-sm">
                <svg className="h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <span className="text-lg text-gray-400">
                {isSpanish ? 'Perfil de pérdida de peso' : 'Weight Loss profile'}
              </span>
            </div>

            <div
              className={`relative flex items-start gap-4 pb-6 transition-all duration-500 ease-out ${
                showStep2 ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'
              }`}
            >
              <div className="relative z-10 mt-5">
                <div
                  className={`absolute inset-0 h-6 w-6 ${isOt ? 'bg-[#cab172]' : 'bg-[#4fa87f]'} animate-ping rounded-full opacity-40`}
                ></div>
                <div
                  className={`absolute inset-[-4px] h-[34px] w-[34px] ${isOt ? 'bg-[#cab172]/20' : 'bg-[#4fa87f]/20'} animate-pulse rounded-full`}
                ></div>
                <div
                  className={`relative h-6 w-6 ${isOt ? 'bg-[#cab172]' : 'bg-[#4fa87f]'} rounded-full shadow-lg ${isOt ? 'shadow-[#cab172]/30' : 'shadow-[#4fa87f]/30'}`}
                ></div>
              </div>
              <div
                className={`flex-1 ${isOt ? 'bg-[#f5ecd8]' : 'bg-[#f0feab]'} rounded-2xl p-5 shadow-lg ${isOt ? 'shadow-[#f5ecd8]/30' : 'shadow-[#f0feab]/30'} transform transition-transform hover:scale-[1.02]`}
              >
                <h2 className="mb-2 text-lg font-semibold text-[#413d3d]">
                  {isSpanish ? 'Historial Médico' : 'Medical History'}
                </h2>
                <p className="text-sm leading-relaxed text-[#413d3d]/70">
                  {isSpanish
                    ? 'Un proveedor revisará esto para crear un plan basado en tus metas.'
                    : 'A provider will review this to create a plan based on your goals.'}
                </p>
              </div>
            </div>

            <div
              className={`relative flex items-center gap-4 transition-all duration-500 ease-out ${
                showStep3 ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'
              }`}
            >
              <div className="relative z-10 h-6 w-6 rounded-full border-2 border-gray-200 bg-white shadow-sm"></div>
              <span className="text-lg text-gray-300">
                {isSpanish ? 'Tratamiento' : 'Treatment'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-6 pb-8 lg:max-w-lg lg:px-8">
        <p className="copyright-text text-center">
          © 2026 EONPro, LLC. All rights reserved.
          <br />
          Exclusive and protected process.
        </p>
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default MedicalHistoryOverviewStep;
