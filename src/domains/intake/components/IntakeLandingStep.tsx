'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import type { FormBranding } from '../types/form-engine';

export type IntakeBrand = 'eonmeds' | 'otmens' | 'wellmedr';

interface BrandAssets {
  logo: string;
  lottie: string;
  nursePhoto: string;
  patientPhotos: string;
  ratingImage: string;
  accentColor: string;
  privacyUrl: string;
  brandName: string;
}

const BRAND_ASSETS: Record<IntakeBrand, BrandAssets> = {
  eonmeds: {
    logo: 'https://static.wixstatic.com/shapes/c49a9b_a0bd04a723284392ac265f9e53628dd6.svg',
    lottie: 'https://lottie.host/embed/9c7564a3-b6ee-4e8b-8b5e-14a59b28c515/3Htnjbp08p.lottie',
    nursePhoto: 'https://static.wixstatic.com/media/c49a9b_3505f05c6c774d748c2e20f178e7c917~mv2.png',
    patientPhotos: 'https://static.wixstatic.com/media/c49a9b_eb72f3aa74474c7bb2e447a5e852a8f7~mv2.webp',
    ratingImage: 'https://static.wixstatic.com/shapes/c49a9b_ea75afc771f74c108742b781ab47157d.svg',
    accentColor: '#4fa87f',
    privacyUrl: '#',
    brandName: 'EONMeds',
  },
  otmens: {
    logo: 'https://static.wixstatic.com/shapes/c49a9b_5139736743794db7af38c583595f06fb.svg',
    lottie: 'https://lottie.host/embed/34070443-ae33-4f25-b944-452a94704677/Ol2wOdhexp.lottie',
    nursePhoto: 'https://static.wixstatic.com/media/c49a9b_5b9a0976f96044ccbf05c4d90c382f2d~mv2.webp',
    patientPhotos: 'https://static.wixstatic.com/media/c49a9b_e11bf27141fa4676b7c9d9f2438b334a~mv2.webp',
    ratingImage: 'https://static.wixstatic.com/shapes/c49a9b_ea75afc771f74c108742b781ab47157d.svg',
    accentColor: '#cab172',
    privacyUrl: 'https://www.otmens.com/privacypolicy',
    brandName: 'Overtime Men\'s Health',
  },
  wellmedr: {
    logo: '/wellmedr-logo.svg',
    lottie: '',
    nursePhoto: 'https://static.wixstatic.com/media/c49a9b_3505f05c6c774d748c2e20f178e7c917~mv2.png',
    patientPhotos: 'https://static.wixstatic.com/media/c49a9b_eb72f3aa74474c7bb2e447a5e852a8f7~mv2.webp',
    ratingImage: 'https://static.wixstatic.com/shapes/c49a9b_ea75afc771f74c108742b781ab47157d.svg',
    accentColor: '#0C2631',
    privacyUrl: 'https://www.wellmedr.com/privacypolicy',
    brandName: 'WellMedR',
  },
};

interface IntakeLandingStepProps {
  branding?: FormBranding;
  brand?: IntakeBrand;
  language: 'en' | 'es';
  onLanguageChange?: (lang: 'en' | 'es') => void;
  onStart: () => void;
}

function getBrandContent(brand: IntakeBrand) {
  const assets = BRAND_ASSETS[brand];
  return {
    headline: {
      en: "Let's evaluate your treatment options.",
      es: 'Evaluemos tus opciones de tratamiento.',
    },
    subtitle: {
      en: 'Discover personalized solutions based on your goals, habits, and health history.',
      es: 'Descubre soluciones personalizadas basadas en tus objetivos, hábitos e historial médico.',
    },
    trusted: {
      en: brand === 'otmens' ? 'Trusted by over 10,000+ patients'
        : brand === 'wellmedr' ? 'Trusted by thousands of patients'
        : 'Trusted by over 20,000 patients',
      es: brand === 'otmens' ? 'Confiado por más de 10,000+ pacientes'
        : brand === 'wellmedr' ? 'Confiado por miles de pacientes'
        : 'Confiado por más de 20,000 pacientes',
    },
    privacy: {
      en: `By clicking "Start", you agree that ${assets.brandName} may use your responses to personalize your experience and for other purposes in accordance with our `,
      es: `Al hacer clic en "Comenzar", aceptas que ${assets.brandName} puede usar tus respuestas para personalizar tu experiencia y para otros propósitos de acuerdo con nuestra `,
    },
    privacyEnd: {
      en: '. The information you provide will be used as part of your medical evaluation.',
      es: '. La información que proporciones se utilizará como parte de tu evaluación médica.',
    },
    privacyLink: {
      en: 'Privacy Policy',
      es: 'Política de Privacidad',
    },
    cta: {
      en: 'Start',
      es: 'Comenzar',
    },
    hipaa: {
      en: 'HIPAA-Secured Medical Intake',
      es: 'Formulario médico seguro conforme a HIPAA',
    },
  };
}

export default function IntakeLandingStep({
  branding,
  brand = 'eonmeds',
  language,
  onStart,
}: IntakeLandingStepProps) {
  const CONTENT = getBrandContent(brand);
  const assets = BRAND_ASSETS[brand];
  const t = (key: keyof ReturnType<typeof getBrandContent>) => CONTENT[key][language];
  const isSpanish = language === 'es';
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setTimeout(() => setAnimate(true), 100);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Progress bar accent */}
      <div className="w-full h-1" style={{ backgroundColor: brand === 'otmens' ? '#f5ecd8' : brand === 'wellmedr' ? '#e5eaee' : '#f0feab' }} />

      {/* Main content */}
      <div className="flex-1 flex flex-col px-6 lg:px-8 pt-8 lg:pt-12 pb-6 max-w-md lg:max-w-2xl mx-auto w-full">
        {/* Logo + Lottie */}
        <div className="flex items-center justify-between mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assets.logo} alt={assets.brandName} className="h-7 w-auto" />
          <div className="w-[70px] h-[70px] overflow-hidden">
            <iframe
              src={assets.lottie}
              style={{ width: '70px', height: '70px', border: 'none', background: 'transparent' }}
              title={`${assets.brandName} animation`}
            />
          </div>
        </div>

        {/* Nurse photo */}
        <div className={`mb-4 transform transition-all duration-700 ease-out ${animate ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-5 scale-95'}`}>
          <div className="w-32 h-32 rounded-full overflow-hidden relative">
            <Image
              src={assets.nursePhoto}
              alt="Healthcare professional"
              fill
              sizes="128px"
              className="object-cover"
              priority
            />
          </div>
        </div>

        {/* Headline */}
        <div className="text-left mb-6">
          <h1
            className={`page-title transform transition-all duration-700 ease-out delay-150 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ color: assets.accentColor }}
          >
            {isSpanish ? (
              <>Evaluemos tus<br />opciones de tratamiento.</>
            ) : (
              <>Let&apos;s evaluate your<br />treatment options.</>
            )}
          </h1>
          <p className={`page-subtitle leading-tight transform transition-all duration-700 ease-out delay-300 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {isSpanish ? (
              <>Descubre soluciones personalizadas basadas en<br />tus metas, hábitos e historial de salud.</>
            ) : (
              <>Discover personalized solutions based on<br />your goals, habits, and health history.</>
            )}
          </p>
        </div>

        {/* Trust section */}
        <div className="space-y-3">
          <p className={`text-[15px] font-medium text-[#413d3d] transform transition-all duration-700 ease-out delay-500 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {t('trusted')}
          </p>

          {/* Patient photos */}
          <div className={`flex -space-x-3 transform transition-all duration-700 ease-out ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '600ms' }}>
            <Image
              src={assets.patientPhotos}
              alt="Happy patients"
              width={150}
              height={48}
              className="rounded-lg"
              priority
            />
          </div>

          {/* Google rating */}
          <div className={`flex items-center transform transition-all duration-700 ease-out ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '700ms' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assets.ratingImage}
              alt="Rated 4.9/5 based on verified reviews"
              width={200}
              height={50}
              className="object-contain"
            />
          </div>
        </div>
      </div>

      {/* Bottom — privacy + CTA */}
      <div
        className={`px-6 lg:px-8 pb-8 max-w-md lg:max-w-2xl mx-auto w-full space-y-3 transform transition-all duration-700 ease-out ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
        style={{ transitionDelay: '800ms' }}
      >
        <div className="mb-4">
          <p className="text-[11px] lg:text-[13px] leading-tight" style={{ fontWeight: 450, color: 'rgba(65, 61, 61, 0.6)' }}>
            {t('privacy')}
            <a href={assets.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'rgba(65, 61, 61, 0.6)' }}>{t('privacyLink')}</a>
            {t('privacyEnd')}
          </p>
        </div>

        <button
          onClick={onStart}
          className="continue-button shine-button w-full"
        >
          <span className="text-white">{t('cta')}</span>
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="mt-6 text-center" style={{ lineHeight: '1.2' }}>
          <p className="text-gray-400 font-medium text-[11px]">{t('hipaa')}</p>
          <p className="text-gray-400 text-[11px]">
            © 2026 EONPro, LLC. All rights reserved.
            <br />
            Exclusive and protected process. Copying or reproduction without authorization is prohibited.
          </p>
        </div>
      </div>
    </div>
  );
}
