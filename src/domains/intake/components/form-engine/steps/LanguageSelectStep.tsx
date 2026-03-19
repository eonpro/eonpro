'use client';

import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions } from '../../../store/intakeStore';

interface LanguageSelectStepProps {
  basePath: string;
  nextStep: string;
}

const EONMEDS_LOGO = 'https://static.wixstatic.com/shapes/c49a9b_a0bd04a723284392ac265f9e53628dd6.svg';

export default function LanguageSelectStep({ basePath, nextStep }: LanguageSelectStepProps) {
  const router = useRouter();
  const { setLanguage } = useLanguage();
  const { markStepCompleted, setCurrentStep, setResponse } = useIntakeActions();

  const handleSelect = (lang: 'en' | 'es') => {
    setLanguage(lang);
    setResponse('language', lang);
    markStepCompleted('language');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full h-1 bg-[#f0feab]" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 lg:px-8 max-w-md lg:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={EONMEDS_LOGO} alt="EONMeds" className="h-8 w-auto mb-10" />

        <h1 className="text-[22px] md:text-[26px] font-semibold text-[#413d3d] text-center leading-snug mb-2">
          Choose your language
        </h1>
        <p className="text-[15px] text-[#413d3d]/50 text-center mb-10">
          Elige tu idioma
        </p>

        <div className="w-full space-y-3">
          <button
            onClick={() => handleSelect('en')}
            className="option-button w-full justify-center gap-3 py-5 text-base"
          >
            <svg width="22" height="14" viewBox="0 0 18 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
              <rect width="18" height="12" rx="1" fill="#B22234"/>
              <rect y="1" width="18" height="1" fill="white"/>
              <rect y="3" width="18" height="1" fill="white"/>
              <rect y="5" width="18" height="1" fill="white"/>
              <rect y="7" width="18" height="1" fill="white"/>
              <rect y="9" width="18" height="1" fill="white"/>
              <rect y="11" width="18" height="1" fill="white"/>
              <rect width="7.2" height="6" rx="0.5" fill="#3C3B6E"/>
            </svg>
            <span className="font-medium">English</span>
          </button>

          <button
            onClick={() => handleSelect('es')}
            className="option-button w-full justify-center gap-3 py-5 text-base"
          >
            <svg width="22" height="14" viewBox="0 0 18 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
              <rect width="18" height="12" rx="1" fill="#FFC400"/>
              <rect width="18" height="3" fill="#C60A1D"/>
              <rect y="9" width="18" height="3" fill="#C60A1D"/>
            </svg>
            <span className="font-medium">Español</span>
          </button>
        </div>
      </div>

      <div className="px-6 lg:px-8 pb-8 text-center">
        <p className="copyright-text">
          © 2026 EONPro, LLC. All rights reserved.<br/>
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}
