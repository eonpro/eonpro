'use client';

import React from 'react';
import type { FormBranding } from '../types/form-engine';

interface IntakeLandingStepProps {
  branding?: FormBranding;
  language: 'en' | 'es';
  onLanguageChange: (lang: 'en' | 'es') => void;
  onStart: () => void;
}

const CONTENT = {
  headline: {
    en: "Let's evaluate your treatment options.",
    es: 'Evaluemos tus opciones de tratamiento.',
  },
  subtitle: {
    en: 'Discover personalized solutions based on your goals, habits, and medical history.',
    es: 'Descubre soluciones personalizadas basadas en tus objetivos, hábitos e historial médico.',
  },
  trusted: {
    en: 'Trusted by over 20,000 patients',
    es: 'Confiado por más de 20,000 pacientes',
  },
  ratingLine: {
    en: 'rated 4.9/5 based on 434 verified reviews',
    es: 'calificación 4.9/5 basada en 434 reseñas verificadas',
  },
  privacy: {
    en: 'By clicking "Start", you agree that EONMeds may use your responses to personalize your experience and for other purposes in accordance with our Privacy Policy. The information you provide will be used as part of your medical evaluation.',
    es: 'Al hacer clic en "Comenzar", aceptas que EONMeds puede usar tus respuestas para personalizar tu experiencia y para otros propósitos de acuerdo con nuestra Política de Privacidad. La información que proporciones se utilizará como parte de tu evaluación médica.',
  },
  cta: {
    en: 'Start',
    es: 'Comenzar',
  },
  privacyLink: {
    en: 'Privacy Policy',
    es: 'Política de Privacidad',
  },
};

export default function IntakeLandingStep({
  branding,
  language,
  onLanguageChange,
  onStart,
}: IntakeLandingStepProps) {
  const t = (key: keyof typeof CONTENT) => CONTENT[key][language];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Language toggle */}
      <div className="flex justify-end px-4 pt-4">
        <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={() => onLanguageChange('en')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              language === 'en'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            🇺🇸 EN
          </button>
          <button
            onClick={() => onLanguageChange('es')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              language === 'es'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            🇲🇽 ES
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col px-6 lg:px-8 max-w-[520px] mx-auto w-full">
        {/* Clinic logo */}
        {branding?.logo && (
          <div className="pt-6 pb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding.logo}
              alt="Clinic"
              className="h-8 object-contain"
            />
          </div>
        )}

        {/* Hero icon — medical stethoscope */}
        <div className="pt-4 pb-6">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-tight tracking-tight text-emerald-700">
          {t('headline')}
        </h1>
        <p className="mt-3 text-base text-gray-500 leading-relaxed">
          {t('subtitle')}
        </p>

        {/* Trust badge */}
        <div className="mt-8">
          <p className="text-sm font-semibold text-gray-900">{t('trusted')}</p>

          {/* Avatar stack */}
          <div className="flex items-center mt-3 -space-x-2">
            {['#10b981', '#3b82f6', '#f59e0b', '#ef4444'].map((color, i) => (
              <div
                key={i}
                className="w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: color }}
              >
                {['S', 'M', 'A', 'J'][i]}
              </div>
            ))}
          </div>

          {/* Google rating */}
          <div className="flex items-center gap-2 mt-4">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335"/>
            </svg>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg key={star} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">{t('ratingLine')}</p>
        </div>
      </div>

      {/* Bottom section — privacy + CTA */}
      <div className="px-6 lg:px-8 pb-6 max-w-[520px] mx-auto w-full space-y-4">
        <p className="text-xs text-gray-400 leading-relaxed">
          {t('privacy')}
        </p>

        <button
          onClick={onStart}
          className="
            w-full flex items-center justify-center gap-3 py-4 px-8
            text-white text-[1.0625rem] font-medium
            rounded-full transition-all duration-200
            bg-[linear-gradient(135deg,#1f2937_0%,#111827_100%)]
            hover:-translate-y-0.5 hover:shadow-lg
            active:translate-y-0
          "
        >
          <span>{t('cta')}</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <p className="text-center text-xs text-gray-400">
          © 2026 EONPro, LLC. All rights reserved.
          <br />
          Exclusive and protected process. Copying or reproduction without authorization is prohibited.
        </p>
      </div>
    </div>
  );
}
