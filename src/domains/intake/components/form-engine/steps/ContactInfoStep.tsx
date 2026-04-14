'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useIntakeActions, useIntakeStore } from '../../../store/intakeStore';

interface ContactInfoStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function ContactInfoStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: ContactInfoStepProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const isSpanish = language === 'es';

  const responses = useIntakeStore((state) => state.responses);
  const clinicSlug = useIntakeStore((s) => s.clinicSlug);
  const isOt = clinicSlug === 'ot' || clinicSlug === 'otmens';
  const { setResponse, markStepCompleted, setCurrentStep } = useIntakeActions();

  const [email, setEmail] = useState(String(responses.email || ''));
  const [phone, setPhone] = useState(String(responses.phone || ''));
  const [consent, setConsent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string) => {
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length === 10;
  };

  const formatPhoneNumber = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length <= 3) return digitsOnly;
    if (digitsOnly.length <= 6) return `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3)}`;
    return `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3, 6)} ${digitsOnly.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length <= 10) {
      setPhone(formatPhoneNumber(digitsOnly));
      if (phoneError) setPhoneError('');
    }
  };

  const handleContinue = () => {
    const isEmailValid = validateEmail(email);
    const isPhoneValid = validatePhone(phone);

    if (!isEmailValid) {
      setEmailError(isSpanish ? 'Por favor ingrese un email válido' : 'Please enter a valid email');
      return;
    }

    if (!isPhoneValid) {
      setPhoneError(
        isSpanish
          ? 'Por favor ingrese un número de teléfono válido'
          : 'Please enter a valid phone number'
      );
      return;
    }

    if (!consent) return;

    const phoneDigitsOnly = phone.replace(/\D/g, '');
    const formattedPhone = '+1' + phoneDigitsOnly;

    setResponse('email', email);
    setResponse('phone', formattedPhone);
    setResponse('contact_consent', true);
    setResponse('smsConsentAccepted', new Date().toISOString());

    markStepCompleted('contact-info');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  const handleBack = () => {
    if (prevStep) {
      setCurrentStep(prevStep);
      router.push(`${basePath}/${prevStep}`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="h-1 w-full bg-gray-100">
        <div
          className="h-full bg-[var(--intake-accent,#f0feab)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
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

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8 pb-48 lg:max-w-2xl lg:px-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <h1 className="page-title">
              {isSpanish ? '¿Cómo podemos contactarte?' : 'How can we contact you?'}
            </h1>
            <p className="page-subtitle">
              {isSpanish
                ? 'Usamos esta información para mantenerte informado sobre tu tratamiento.'
                : 'We use this information to keep you informed about your treatment.'}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                }}
                className={`input-field ${emailError ? '!border-red-500' : ''}`}
              />
              {emailError && <p className="mt-1 text-sm text-red-500">{emailError}</p>}
            </div>

            <div>
              <div className="flex w-full space-x-2">
                <div className="input-field flex !w-auto items-center space-x-2">
                  <span className="text-2xl">🇺🇸</span>
                  <span className="text-[16px] font-medium">+1</span>
                </div>
                <input
                  type="tel"
                  placeholder="000 000 0000"
                  value={phone}
                  onChange={handlePhoneChange}
                  inputMode="numeric"
                  className={`input-field min-w-0 flex-1 ${phoneError ? '!border-red-500' : ''}`}
                />
              </div>
              {phoneError && <p className="mt-1 text-sm text-red-500">{phoneError}</p>}
            </div>

            <div
              className="flex cursor-pointer items-start gap-4"
              onClick={() => setConsent(!consent)}
            >
              <button
                type="button"
                className="mt-0.5 flex aspect-square flex-shrink-0 items-center justify-center rounded border-2 border-gray-300 transition-all"
                style={{
                  width: 22,
                  height: 22,
                  minWidth: 22,
                  maxWidth: 22,
                  minHeight: 22,
                  maxHeight: 22,
                  backgroundColor: consent ? 'var(--intake-selected-bg, #f0feab)' : 'white',
                }}
              >
                {consent && (
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="#413d3d"
                    strokeWidth={3}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <div className="text-[13px] leading-snug text-[#413d3d]">
                {isSpanish ? (
                  <>
                    Acepto la{' '}
                    <a
                      href="#"
                      className="text-[#413d3d] underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Política de Privacidad
                    </a>{' '}
                    y autorizo recibir comunicaciones.
                  </>
                ) : (
                  <>
                    I accept the{' '}
                    <a
                      href="#"
                      className="text-[#413d3d] underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </a>{' '}
                    and authorize receiving communications.
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="info-container">
            <p className="text-xs leading-relaxed">
              {isSpanish
                ? isOt
                  ? 'Al proporcionar tu número y continuar, consientes recibir mensajes de texto de OT Mens / EONPro. Pueden aplicarse tarifas de mensajes y datos.'
                  : 'Al proporcionar tu número y continuar, consientes recibir mensajes de texto de EONPro. Pueden aplicarse tarifas de mensajes y datos.'
                : isOt
                  ? 'By providing your number and continuing, you consent to receive text messages from OT Mens / EONPro. Message and data rates may apply.'
                  : 'By providing your number and continuing, you consent to receive text messages from EONPro. Message and data rates may apply.'}
            </p>
          </div>
        </div>
      </div>

      <div className="sticky-bottom-button mx-auto w-full max-w-md lg:max-w-2xl">
        <button
          onClick={handleContinue}
          disabled={!email || !phone || !consent}
          className="continue-button"
        >
          <span>{isSpanish ? 'Continuar' : 'Continue'}</span>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="mt-6 text-center">
          <p className="copyright-text">
            {isSpanish ? (
              <>
                © 2026 EONPro, LLC. Todos los derechos reservados.
                <br />
                Proceso exclusivo y protegido.
              </>
            ) : (
              <>
                © 2026 EONPro, LLC. All rights reserved.
                <br />
                Exclusive and protected process.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
