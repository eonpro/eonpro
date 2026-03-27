'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore, useIntakeActions } from '../../../store/intakeStore';

interface ReviewStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function ReviewStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: ReviewStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';

  const responses = useIntakeStore((state) => state.responses);
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const { markStepCompleted, setCurrentStep } = useIntakeActions();

  const [confirmed, setConfirmed] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const currentWeight = parseInt(String(responses.current_weight || responses.currentWeight || '')) || 0;
  const heightFeet = parseInt(String(responses.height_feet || responses.heightFeet || '')) || 0;
  const heightInches = parseInt(String(responses.height_inches || responses.heightInches || '')) || 0;
  const totalInches = heightFeet * 12 + heightInches;
  const bmi = totalInches > 0 ? Math.round(((currentWeight / (totalInches * totalInches)) * 703) * 10) / 10 : 0;

  const handleContinue = () => {
    if (confirmed) {
      markStepCompleted('review');
      setCurrentStep(nextStep);
      router.push(`${basePath}/${nextStep}`);
    }
  };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  const firstName = String(responses.firstName || '');
  const lastName = String(responses.lastName || '');

  const reviewItems = [
    { label: isSpanish ? 'Nombre' : 'Name', value: `${firstName} ${lastName}`.trim() || '-' },
    { label: isSpanish ? 'Fecha de nacimiento' : 'Date of birth', value: String(responses.dob || '-') },
    { label: isSpanish ? 'Email' : 'Email', value: String(responses.email || '-') },
    { label: isSpanish ? 'Teléfono' : 'Phone', value: String(responses.phone || '-') },
    { label: isSpanish ? 'Estado' : 'State', value: String(responses.stateFull || responses.state || '-') },
    { label: isSpanish ? 'Peso actual' : 'Current weight', value: currentWeight ? `${currentWeight} lbs` : '-' },
    { label: isSpanish ? 'Altura' : 'Height', value: heightFeet ? `${heightFeet}'${heightInches}"` : '-' },
    { label: isSpanish ? 'IMC' : 'BMI', value: bmi ? bmi.toString() : '-' },
  ];

  const accentColor = isOt ? '#cab172' : '#4fa87f';
  const accentBg = isOt ? '#f5ecd8' : '#f0feab';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full h-[5px] bg-gray-100 rounded-full">
        <div
          className="h-full rounded-full"
          style={{ width: `${progressPercent}%`, backgroundColor: accentColor, transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </div>

      {prevStep && (
        <div className="px-6 lg:px-8 pt-6 max-w-md lg:max-w-2xl mx-auto w-full">
          <button onClick={handleBack} className="inline-block p-2 -ml-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-6 h-6 text-[#413d3d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 px-6 lg:px-8 py-6 pb-10 max-w-md lg:max-w-2xl mx-auto w-full">
        <div className="space-y-6">
          {/* Header with icon */}
          <div className={`transform transition-all duration-700 ease-out ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: accentBg }}>
                <svg className="w-5 h-5" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="page-title" style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)' }}>
                  {isSpanish ? 'Revisa tu información' : 'Review your information'}
                </h1>
              </div>
            </div>
            <p className="page-subtitle">
              {isSpanish
                ? 'Por favor confirma que la información es correcta.'
                : 'Please confirm your information is correct.'}
            </p>
          </div>

          {/* Review card */}
          <div
            className={`rounded-2xl overflow-hidden border transform transition-all duration-700 ease-out ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            style={{ borderColor: `${accentColor}30`, transitionDelay: '150ms' }}
          >
            {/* Card header */}
            <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: accentBg }}>
              <svg className="w-4 h-4" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm font-semibold" style={{ color: '#413d3d' }}>
                {firstName ? `${firstName}'s ${isSpanish ? 'perfil' : 'profile'}` : (isSpanish ? 'Tu perfil' : 'Your profile')}
              </span>
            </div>

            {/* Review rows */}
            <div className="bg-white">
              {reviewItems.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex justify-between items-center px-5 py-3.5 border-b border-gray-100 last:border-0 transform transition-all duration-500 ease-out ${animate ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
                  style={{ transitionDelay: `${200 + idx * 60}ms` }}
                >
                  <span className="text-[13px] text-[#413d3d]/60">{item.label}</span>
                  <span className="text-[13px] font-medium text-[#413d3d]">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm checkbox */}
          <div
            className={`flex items-start gap-3 p-4 rounded-xl bg-gray-50 transform transition-all duration-700 ease-out ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ transitionDelay: '600ms' }}
          >
            <button
              type="button"
              onClick={() => setConfirmed(!confirmed)}
              className="mt-0.5 flex-shrink-0 aspect-square rounded flex items-center justify-center cursor-pointer transition-all"
              style={{
                width: 22, height: 22, minWidth: 22, maxWidth: 22, minHeight: 22, maxHeight: 22,
                border: confirmed ? `2px solid ${accentColor}` : '2px solid #d1d5db',
                backgroundColor: confirmed ? accentColor : '#ffffff',
              }}
            >
              {confirmed && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span
              className="text-[13px] text-[#413d3d] leading-snug cursor-pointer"
              onClick={() => setConfirmed(!confirmed)}
            >
              {isSpanish
                ? 'Confirmo que la información proporcionada es precisa y verdadera.'
                : 'I confirm the information provided is accurate and truthful.'}
            </span>
          </div>

          {/* Continue button */}
          <div className="mt-5">
            <button
              onClick={handleContinue}
              disabled={!confirmed}
              className="continue-button"
            >
              <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <p className="copyright-text text-center mt-4">
              {isSpanish ? (
                <>© 2026 EONPro, LLC. Todos los derechos reservados.<br />Proceso exclusivo y protegido.</>
              ) : (
                <>© 2026 EONPro, LLC. All rights reserved.<br />Exclusive and protected process.</>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
