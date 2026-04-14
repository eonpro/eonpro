'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore } from '../../../store/intakeStore';

interface QualifiedStepProps {
  basePath: string;
  prevStep: string | null;
}

type MedChoice = 'semaglutide' | 'tirzepatide';
type UserSegment = 'sema-user' | 'tirz-user' | 'new-user';

const T = {
  greatNews: { en: 'Great news', es: '¡Excelentes noticias' },
  qualifyMsg: {
    en: 'Based on your answers, you qualify for treatment with either',
    es: 'Según tus respuestas, calificas para tratamiento con',
  },
  or: { en: 'or', es: 'o' },
  bothEffective: {
    en: 'Both are highly effective GLP-1 medications clinically proven to support weight loss, improve metabolic health, and help curb appetite.',
    es: 'Ambos son medicamentos GLP-1 altamente efectivos clínicamente comprobados para apoyar la pérdida de peso, mejorar la salud metabólica y ayudar a controlar el apetito.',
  },
  readyToLevel: {
    en: 'Ready to level up your results?',
    es: '¿Listo para mejorar tus resultados?',
  },
  upgradeSubtitle: {
    en: "Since you've used Semaglutide, you may benefit from upgrading to Tirzepatide — the most powerful GLP-1 option available.",
    es: 'Ya que has usado Semaglutida, podrías beneficiarte de una actualización a Tirzepatida — la opción GLP-1 más potente disponible.',
  },
  continueSuccess: {
    en: 'Continue your weight loss journey',
    es: 'Continúa tu camino de pérdida de peso',
  },
  continueSubtitle: {
    en: "You're already on Tirzepatide — the most effective GLP-1 available. Let's keep your momentum going.",
    es: 'Ya estás tomando Tirzepatida — el GLP-1 más efectivo disponible. Mantengamos tu impulso.',
  },
  chooseTitle: {
    en: 'Choose your medication',
    es: 'Elige tu medicamento',
  },
  chooseSubtitle: {
    en: 'Both options are clinically proven. Your provider will confirm the best fit during your consultation.',
    es: 'Ambas opciones están clínicamente probadas. Tu proveedor confirmará la mejor opción durante tu consulta.',
  },
  semaName: { en: 'Semaglutide', es: 'Semaglutida' },
  semaTag: { en: 'Weekly GLP-1 injection', es: 'Inyección semanal GLP-1' },
  semaLoss: { en: '15–20% avg weight loss', es: '15–20% pérdida de peso promedio' },
  semaPrice: { en: '', es: '' },
  semaCta: { en: 'Clinically proven, gentle start', es: 'Clínicamente probado, inicio suave' },
  tirzName: { en: 'Tirzepatide', es: 'Tirzepatida' },
  tirzTag: { en: 'Dual GIP + GLP-1 action', es: 'Acción dual GIP + GLP-1' },
  tirzLoss: { en: '20–25% avg weight loss', es: '20–25% pérdida de peso promedio' },
  tirzPrice: { en: '', es: '' },
  tirzCta: { en: 'Most powerful option available', es: 'La opción más potente disponible' },
  upgradeBadge: { en: 'Recommended Upgrade', es: 'Mejora Recomendada' },
  btnUpgrade: { en: 'Upgrade to Tirzepatide', es: 'Actualizar a Tirzepatida' },
  btnStaySema: { en: 'Continue with Semaglutide', es: 'Continuar con Semaglutida' },
  btnContinueTirz: { en: 'Continue with Tirzepatide', es: 'Continuar con Tirzepatida' },
  btnSelectSema: { en: 'Select Semaglutide', es: 'Seleccionar Semaglutida' },
  btnSelectTirz: { en: 'Select Tirzepatide', es: 'Seleccionar Tirzepatida' },
  discounts: {
    en: 'Qualifying discounts will be applied',
    es: 'Descuentos calificados serán aplicados',
  },
};

export default function QualifiedStep({ basePath, prevStep }: QualifiedStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const responses = useIntakeStore((state) => state.responses);
  const [firstName, setFirstName] = useState('');
  const [showPhase2, setShowPhase2] = useState(false);
  const submittedRef = useRef(false);
  const isSpanish = language === 'es';
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const refCode = useIntakeStore((s) => s.refCode);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const t = (key: keyof typeof T) => T[key][language];

  const glp1Type = (responses.glp1_type as string) || '';

  const segment: UserSegment =
    glp1Type === 'semaglutide'
      ? 'sema-user'
      : glp1Type === 'tirzepatide'
        ? 'tirz-user'
        : 'new-user';

  useEffect(() => {
    if (responses.firstName) setFirstName(String(responses.firstName));
  }, [responses.firstName]);

  useEffect(() => {
    const confettiColors = isOt
      ? ['#cab172', '#f5ecd8', '#413d3d', '#d4a843', '#e8d5a0']
      : ['#7cb342', '#aed581', '#e8f5d9', '#4fa87f', '#66bb6a', '#81c784'];
    const launch = () => {
      const c = (window as unknown as { confetti?: (opts: unknown) => void }).confetti;
      if (!c) return;
      const end = Date.now() + 3000;
      const frame = () => {
        c({
          particleCount: 10,
          angle: 270,
          spread: 180,
          origin: { x: 0.5, y: 0 },
          gravity: 1.5,
          startVelocity: 30,
          colors: confettiColors,
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    };
    const timer1 = setTimeout(() => {
      if ((window as unknown as { confetti?: unknown }).confetti) {
        launch();
      } else {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.0/dist/confetti.browser.min.js';
        s.onload = launch;
        document.head.appendChild(s);
      }
    }, 300);
    const timer2 = setTimeout(() => {
      setShowPhase2(true);
    }, 800);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPeptide = basePath.includes('peptides');
  const isTRT = basePath.includes('/trt');
  const effectiveRefCode =
    refCode ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('intake_refCode') : null);

  useEffect(() => {
    if (submittedRef.current) return;
    const hasIdentifier = responses.firstName || responses.email;
    const hasEnoughData = Object.keys(responses).length >= 5;
    if (!hasIdentifier || !hasEnoughData) return;
    submittedRef.current = true;

    const submitWithRetry = async (attempt = 1): Promise<void> => {
      try {
        const res = await fetch('/api/intake-forms/submit-to-eonpro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            responses,
            submissionType: 'complete',
            qualified: 'Yes',
            clinicSlug,
            treatmentType: isPeptide ? 'peptides' : isTRT ? 'trt' : 'weight-loss',
            ...(effectiveRefCode ? { refCode: effectiveRefCode } : {}),
          }),
        });
        if (!res.ok && attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          return submitWithRetry(attempt + 1);
        }
        const data = await res.json().catch(() => ({}));
        if (data.eonproDatabaseId) {
          sessionStorage.setItem('eonpro_patient_id', String(data.eonproDatabaseId));
        }
      } catch {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          return submitWithRetry(attempt + 1);
        }
      }
    };

    submitWithRetry();
  }, [responses]);

  // confetti logic moved inline into the mount useEffect above

  const goCheckout = (medication: MedChoice) => {
    Object.entries(responses).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        sessionStorage.setItem(
          `intake_${key}`,
          typeof value === 'object' ? JSON.stringify(value) : String(value)
        );
      }
    });
    sessionStorage.setItem('intake_selected_medication', medication);
    router.push(`${basePath}/checkout?medication=${medication}`);
  };

  const handleBack = () => {
    if (prevStep) router.push(`${basePath}/${prevStep}`);
  };

  const bookingParams = new URLSearchParams({
    ...(responses.firstName ? { first_name: String(responses.firstName) } : {}),
    ...(responses.lastName ? { last_name: String(responses.lastName) } : {}),
    ...(responses.email ? { email: String(responses.email) } : {}),
    ...(responses.phone ? { phone: String(responses.phone).replace(/\D/g, '') } : {}),
  });
  const BOOKING_URL = `https://api.leadconnectorhq.com/widget/bookings/overtime-mens-health-initial-c${bookingParams.toString() ? `?${bookingParams.toString()}` : ''}`;

  if (isPeptide) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-white">
        <div className="h-1 w-full bg-gray-200">
          <div className="h-full w-full bg-[var(--intake-accent,#cab172)] transition-all duration-300" />
        </div>

        {prevStep && (
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
                />
              </svg>
            </button>
          </div>
        )}

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 lg:max-w-2xl lg:px-8">
          <div className="mb-6 h-32 w-32 overflow-hidden rounded-2xl border-2 border-[#cab172]/20">
            <img
              src="https://static.wixstatic.com/media/c49a9b_0e0d844da3914972855d63bc78725d99~mv2.png"
              alt="Provider"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="mb-8 space-y-4">
            <h1 className="text-2xl font-bold leading-tight lg:text-3xl">
              <span className="text-gray-400">
                {isSpanish ? 'Felicidades' : 'Congratulations'}{' '}
              </span>
              <span>🥳</span>
              <span className="text-gray-400"> — </span>
              <br />
              <span className="text-gray-400">
                {isSpanish ? 'calificas para una' : 'you qualify for a'}
              </span>
              <br />
              <span className="text-[#413d3d]">
                {isSpanish ? 'consulta de Terapia de Péptidos.' : 'Peptide Therapy consultation.'}
              </span>
            </h1>
            <p className="text-base text-gray-400">
              {isSpanish
                ? 'Reserva una consulta y nuestro equipo podrá explicarte el tratamiento y ayudarte a comenzar.'
                : 'Book a consultation and our team will be able to explain the treatment and help you get started!'}
            </p>
          </div>

          <div
            className={`transition-all duration-700 ease-out ${showPhase2 ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
          >
            <div className="flex items-center gap-4 rounded-2xl bg-[#f5ecd8] p-5">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full">
                <img
                  src="https://static.wixstatic.com/media/c49a9b_69f9d06860b246988ff7df8096e170fb~mv2.png"
                  alt="Provider"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1">
                <h3 className="mb-2 font-semibold text-[#413d3d]">
                  {isSpanish ? 'Reserva una consulta' : 'Book a consultation'}
                </h3>
                <a
                  href={BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: '#cab172' }}
                >
                  {isSpanish ? 'Reservar Consulta' : 'Book a Consult'}
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md px-6 pb-8 lg:max-w-2xl lg:px-8">
          <p className="copyright-text text-center">
            Copyright © 2025 Overtime Mens Health All Rights Reserved
            <br />
            powered by EONPro, LLC. Exclusive and protected process.
          </p>
        </div>
      </div>
    );
  }

  if (isTRT) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-white">
        <div className="h-1 w-full bg-gray-200">
          <div className="h-full w-full bg-[var(--intake-accent,#cab172)] transition-all duration-300" />
        </div>

        {prevStep && (
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
                />
              </svg>
            </button>
          </div>
        )}

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 lg:max-w-2xl lg:px-8">
          <div className="mb-6 h-32 w-32 overflow-hidden rounded-2xl border-2 border-[#cab172]/20">
            <img
              src="https://static.wixstatic.com/media/c49a9b_0e0d844da3914972855d63bc78725d99~mv2.png"
              alt="Provider"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="mb-8 space-y-4">
            <h1 className="text-2xl font-bold leading-tight lg:text-3xl">
              <span className="text-gray-400">
                {isSpanish ? 'Felicidades' : 'Congratulations'}{' '}
              </span>
              <span>🥳</span>
              <span className="text-gray-400"> — </span>
              <br />
              <span className="text-gray-400">
                {isSpanish ? 'calificas para una' : 'you qualify for a'}
              </span>
              <br />
              <span className="text-[#413d3d]">
                {isSpanish
                  ? 'consulta de Terapia de Reemplazo de Testosterona.'
                  : 'TRT consultation.'}
              </span>
            </h1>
            <p className="text-base text-gray-400">
              {isSpanish
                ? 'Reserva una consulta y nuestro equipo podrá explicarte el tratamiento y ayudarte a comenzar.'
                : 'Book a consultation and our team will be able to explain the treatment and help you get started!'}
            </p>
          </div>

          <div
            className={`transition-all duration-700 ease-out ${showPhase2 ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
          >
            <div className="flex items-center gap-4 rounded-2xl bg-[#f5ecd8] p-5">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full">
                <img
                  src="https://static.wixstatic.com/media/c49a9b_0e0d844da3914972855d63bc78725d99~mv2.png"
                  alt="Provider"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1">
                <h3 className="mb-2 font-semibold text-[#413d3d]">
                  {isSpanish ? 'Reserva una consulta' : 'Book a consultation'}
                </h3>
                <a
                  href={BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: '#cab172' }}
                >
                  {isSpanish ? 'Reservar Consulta' : 'Book a Consult'}
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md px-6 pb-8 lg:max-w-2xl lg:px-8">
          <p className="copyright-text text-center">
            Copyright © 2025 Overtime Mens Health All Rights Reserved
            <br />
            powered by EONPro, LLC. Exclusive and protected process.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white">
      <div className="h-1 w-full bg-gray-200">
        <div className="h-full w-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300" />
      </div>

      {prevStep && (
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
              />
            </svg>
          </button>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 lg:max-w-2xl lg:px-8">
        {/* Phase 1: Qualification celebration */}
        <div className="mb-6 h-48 w-56 overflow-hidden rounded-xl">
          <img
            src="https://static.wixstatic.com/media/c49a9b_e424b9a0a7264ab3a9f667231c71a57b~mv2.webp"
            alt="Happy couple"
            className="h-full w-full object-cover"
          />
        </div>

        <div className="mb-8 space-y-4">
          <h1 className="text-2xl font-bold leading-tight lg:text-3xl">
            <mark style={{ backgroundColor: '#f2fdb4' }}>
              {t('greatNews')} {firstName}
            </mark>{' '}
            <span>🥳</span> <span className="text-[#413d3d]">—</span>
            <br />
            <span className="text-[#413d3d]">
              {t('qualifyMsg')} <mark style={{ backgroundColor: '#f2fdb4' }}>{t('semaName')}</mark>{' '}
              {t('or')} <mark style={{ backgroundColor: '#f2fdb4' }}>{t('tirzName')}</mark>.
            </span>
          </h1>
          <p className="text-base text-[#413d3d]">{t('bothEffective')}</p>
        </div>

        {/* Phase 2: Smart medication recommendation */}
        <div
          className={`transition-all duration-700 ease-out ${showPhase2 ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
        >
          {segment === 'sema-user' && (
            <SemaUpgradeCard
              isSpanish={isSpanish}
              t={t}
              onUpgrade={() => goCheckout('tirzepatide')}
              onStay={() => goCheckout('semaglutide')}
              isOt={isOt}
            />
          )}
          {segment === 'tirz-user' && (
            <TirzContinueCard
              isSpanish={isSpanish}
              t={t}
              onContinue={() => goCheckout('tirzepatide')}
              isOt={isOt}
            />
          )}
          {segment === 'new-user' && (
            <MedCompareCard
              isSpanish={isSpanish}
              t={t}
              onSelectSema={() => goCheckout('semaglutide')}
              onSelectTirz={() => goCheckout('tirzepatide')}
              isOt={isOt}
            />
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-6 pb-8 lg:max-w-2xl lg:px-8">
        <p className="copyright-text text-center">
          © 2026 EONPro, LLC. All rights reserved.
          <br />
          Exclusive and protected process.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   Sub-components
   ============================================================ */

function MedCard({
  name,
  tag,
  loss,
  price,
  cta,
  badge,
  highlighted,
  onClick,
  btnLabel,
  isOt,
}: {
  name: string;
  tag: string;
  loss: string;
  price: string;
  cta: string;
  badge?: string;
  highlighted?: boolean;
  onClick: () => void;
  btnLabel: string;
  isOt?: boolean;
}) {
  return (
    <div
      className={`space-y-3 rounded-2xl border-2 p-5 transition-all ${highlighted ? (isOt ? 'border-[#cab172] bg-[#f5ecd8]/30' : 'border-[#4fa87f] bg-[#f0feab]/30') : 'border-gray-200 bg-white'}`}
    >
      {badge && (
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${isOt ? 'bg-[#cab172]' : 'bg-[#4fa87f]'} text-white`}
        >
          {badge}
        </span>
      )}
      <h3 className="text-lg font-bold text-[#413d3d]">{name}</h3>
      <p className="text-sm text-gray-500">{tag}</p>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 ${isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'} flex-shrink-0`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium text-[#413d3d]">{loss}</span>
        </div>
        {price && (
          <div className="flex items-center gap-2">
            <svg
              className={`h-4 w-4 ${isOt ? 'text-[#cab172]' : 'text-[#4fa87f]'} flex-shrink-0`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium text-[#413d3d]">{price}</span>
          </div>
        )}
      </div>
      <p className="text-xs italic text-gray-400">{cta}</p>
      <button
        onClick={onClick}
        className={`w-full rounded-full px-6 py-3 text-sm font-semibold transition-all ${
          highlighted
            ? 'bg-[#413d3d] text-white hover:-translate-y-0.5 hover:bg-[#2a2727] hover:shadow-lg'
            : 'border-2 border-[#413d3d] bg-white text-[#413d3d] hover:bg-gray-50'
        }`}
      >
        {btnLabel}
      </button>
    </div>
  );
}

function SemaUpgradeCard({
  isSpanish,
  t,
  onUpgrade,
  onStay,
  isOt,
}: {
  isSpanish: boolean;
  t: (k: keyof typeof T) => string;
  onUpgrade: () => void;
  onStay: () => void;
  isOt?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#413d3d]">{t('readyToLevel')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('upgradeSubtitle')}</p>
      </div>
      <div className="grid gap-4">
        <MedCard
          name={t('tirzName')}
          tag={t('tirzTag')}
          loss={t('tirzLoss')}
          price={t('tirzPrice')}
          cta={t('tirzCta')}
          badge={t('upgradeBadge')}
          highlighted
          onClick={onUpgrade}
          btnLabel={t('btnUpgrade')}
          isOt={isOt}
        />
        <MedCard
          name={t('semaName')}
          tag={t('semaTag')}
          loss={t('semaLoss')}
          price={t('semaPrice')}
          cta={t('semaCta')}
          onClick={onStay}
          btnLabel={t('btnStaySema')}
          isOt={isOt}
        />
      </div>
      <p className="text-center text-xs text-gray-400">{t('discounts')}</p>
    </div>
  );
}

function TirzContinueCard({
  isSpanish,
  t,
  onContinue,
  isOt,
}: {
  isSpanish: boolean;
  t: (k: keyof typeof T) => string;
  onContinue: () => void;
  isOt?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#413d3d]">{t('continueSuccess')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('continueSubtitle')}</p>
      </div>
      <MedCard
        name={t('tirzName')}
        tag={t('tirzTag')}
        loss={t('tirzLoss')}
        price={t('tirzPrice')}
        cta={t('tirzCta')}
        highlighted
        onClick={onContinue}
        btnLabel={t('btnContinueTirz')}
        isOt={isOt}
      />
      <p className="text-center text-xs text-gray-400">{t('discounts')}</p>
    </div>
  );
}

function MedCompareCard({
  isSpanish,
  t,
  onSelectSema,
  onSelectTirz,
  isOt,
}: {
  isSpanish: boolean;
  t: (k: keyof typeof T) => string;
  onSelectSema: () => void;
  onSelectTirz: () => void;
  isOt?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#413d3d]">{t('chooseTitle')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('chooseSubtitle')}</p>
      </div>
      <div className="grid gap-4">
        <MedCard
          name={t('semaName')}
          tag={t('semaTag')}
          loss={t('semaLoss')}
          price={t('semaPrice')}
          cta={t('semaCta')}
          onClick={onSelectSema}
          btnLabel={t('btnSelectSema')}
          isOt={isOt}
        />
        <MedCard
          name={t('tirzName')}
          tag={t('tirzTag')}
          loss={t('tirzLoss')}
          price={t('tirzPrice')}
          cta={t('tirzCta')}
          highlighted
          onClick={onSelectTirz}
          btnLabel={t('btnSelectTirz')}
          isOt={isOt}
        />
      </div>
      <p className="text-center text-xs text-gray-400">{t('discounts')}</p>
    </div>
  );
}
