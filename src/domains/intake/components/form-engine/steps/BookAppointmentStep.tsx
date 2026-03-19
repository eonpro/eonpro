'use client';

import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeStore } from '../../../store/intakeStore';

interface BookAppointmentStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

const BOOKING_URL = 'https://calendly.com/otmens';

const T = {
  title: { en: 'You\'re all set!', es: '¡Todo listo!' },
  subtitle: {
    en: 'Your intake has been submitted. A licensed provider will review your information.',
    es: 'Tu formulario ha sido enviado. Un proveedor licenciado revisará tu información.',
  },
  nextStep: { en: 'Next step: Book your consultation', es: 'Siguiente paso: Reserva tu consulta' },
  nextDesc: {
    en: 'Schedule a telehealth appointment with one of our licensed providers to discuss your personalized treatment plan.',
    es: 'Programa una cita de telesalud con uno de nuestros proveedores licenciados para discutir tu plan de tratamiento personalizado.',
  },
  bookBtn: { en: 'Book Your Appointment', es: 'Reserva Tu Cita' },
  included: { en: "What's included:", es: 'Qué incluye:' },
  item1: { en: 'Personalized treatment plan review', es: 'Revisión de plan de tratamiento personalizado' },
  item2: { en: 'Medication recommendation', es: 'Recomendación de medicamentos' },
  item3: { en: 'Dosage guidance from a licensed provider', es: 'Guía de dosificación de un proveedor licenciado' },
  item4: { en: 'Ongoing support and follow-up', es: 'Soporte continuo y seguimiento' },
  questions: {
    en: 'Have questions? Our team is here to help.',
    es: '¿Tienes preguntas? Nuestro equipo está aquí para ayudarte.',
  },
};

export default function BookAppointmentStep({ basePath, prevStep }: BookAppointmentStepProps) {
  const { language } = useLanguage();
  const responses = useIntakeStore((s) => s.responses);
  const isSpanish = language === 'es';
  const [animate, setAnimate] = useState(false);
  const confettiRef = useRef(false);
  const firstName = (responses.firstName as string) || '';

  useEffect(() => {
    setTimeout(() => setAnimate(true), 100);
    if (!confettiRef.current) {
      confettiRef.current = true;
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.0/dist/confetti.browser.min.js';
      script.onload = () => {
        const confetti = (window as unknown as { confetti: (opts: unknown) => void }).confetti;
        if (!confetti) return;
        const end = Date.now() + 2500;
        const frame = () => {
          confetti({ particleCount: 8, angle: 270, spread: 180, origin: { x: 0.5, y: 0 }, gravity: 1.5, startVelocity: 25, colors: ['#cab172', '#f5ecd8', '#413d3d', '#d4a843', '#e8d5a0'] });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
      };
      document.head.appendChild(script);
    }
  }, []);

  const t = (key: keyof typeof T) => (isSpanish ? T[key].es : T[key].en);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="w-full h-1 bg-gray-100">
        <div className="h-full w-full bg-[var(--intake-accent,#cab172)] transition-all duration-300" />
      </div>

      <div className="flex-1 flex flex-col px-6 lg:px-8 py-8 max-w-[480px] lg:max-w-[560px] mx-auto w-full">
        {/* Success header */}
        <div className={`space-y-4 mb-8 transition-all duration-700 ease-out ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="w-16 h-16 bg-[#cab172]/20 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-[#cab172]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl lg:text-3xl font-bold text-[#413d3d]">
            {t('title')} {firstName && <span className="text-[#cab172]">{firstName}</span>}
          </h1>
          <p className="text-base text-gray-500">{t('subtitle')}</p>
        </div>

        {/* Book appointment card */}
        <div className={`rounded-2xl border-2 border-[#cab172] bg-[#f5ecd8]/30 p-6 space-y-4 mb-6 transition-all duration-700 ease-out delay-300 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <h2 className="text-lg font-bold text-[#413d3d]">{t('nextStep')}</h2>
          <p className="text-sm text-gray-500">{t('nextDesc')}</p>

          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-4 px-6 rounded-full text-center text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: '#413d3d' }}
          >
            {t('bookBtn')}
          </a>
        </div>

        {/* Included list */}
        <div className={`space-y-3 transition-all duration-700 ease-out delay-500 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <h3 className="text-sm font-semibold text-[#413d3d] uppercase tracking-wide">{t('included')}</h3>
          {[t('item1'), t('item2'), t('item3'), t('item4')].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#cab172] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-[#413d3d]">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 lg:px-8 pb-8 max-w-[480px] lg:max-w-[560px] mx-auto w-full space-y-4">
        <p className="text-xs text-gray-400 text-center">{t('questions')}</p>
        <p className="copyright-text text-center">
          {isSpanish ? (
            <>© 2026 EONPro, LLC. Todos los derechos reservados.<br/>Proceso exclusivo y protegido.</>
          ) : (
            <>© 2026 EONPro, LLC. All rights reserved.<br/>Exclusive and protected process.</>
          )}
        </p>
      </div>
    </div>
  );
}
