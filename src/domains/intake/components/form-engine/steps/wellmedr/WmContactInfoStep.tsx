'use client';

import type { CSSProperties } from 'react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIntakeActions, useIntakeStore } from '../../../../store/intakeStore';

interface WmContactInfoStepProps {
  basePath: string;
  nextStep: string;
  prevStep: string | null;
  progressPercent: number;
}

export default function WmContactInfoStep({
  basePath,
  nextStep,
  prevStep,
  progressPercent,
}: WmContactInfoStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponses, markStepCompleted, setCurrentStep } = useIntakeActions();

  const fadeStyle: CSSProperties = {};

  const resolvedNextStep =
    nextStep ||
    (responses.glp1_history_recent === 'yes' ? 'glp1-type-wm' : 'wellmedr-checkout-redirect');


  const firstName = String(responses.firstName || '');
  const [email, setEmail] = useState(String(responses.email || ''));
  const [phone, setPhone] = useState(String(responses.phone || ''));
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = 'Valid email required';
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) e.phone = 'Valid phone required';
    if (!consent) e.consent = 'You must agree to continue';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (!validate()) return;
    setResponses({ email, phone, contact_consent: true });
    markStepCompleted('contact-info-wm');
    setCurrentStep(resolvedNextStep);
    router.push(`${basePath}/${resolvedNextStep}`);
  };

  const handleContinueRef = useRef(handleContinue);
  handleContinueRef.current = handleContinue;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) handleContinueRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <style>{`
        .wm-input {
          width: 100%;
          height: 64px;
          padding: 0 2rem;
          font-size: 1rem;
          font-weight: 500;
          color: #101010;
          background-color: #fff;
          border: 1px solid rgba(53, 28, 12, 0.12);
          border-radius: 20px;
          outline: none;
          letter-spacing: -0.01em;
          line-height: 1.5rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .wm-input:focus {
          border-color: #7b95a9;
          box-shadow: 0 0 0 2px #7b95a9;
        }
        .wm-input::placeholder {
          opacity: 0.3; color: #101010; font-weight: 400;
        }
        @media (min-width: 640px) {
          .wm-input { height: 72px; font-size: 1.25rem; }
        }
      `}</style>
      <div className="h-[3px] w-full" style={{ backgroundColor: '#e5e0d8' }}>
        <div
          className="h-full"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: '#c3b29e',
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>

      <div className="mx-auto grid w-full max-w-[48rem] grid-cols-3 items-center px-6 pt-4">
        <div />
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7" />
        </div>
        <div />
      </div>

      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center px-6 pb-6 sm:px-8">
        <h2
          className="mb-2 text-center text-[1.25rem] font-bold sm:text-[1.5rem]"
          style={{ color: '#101010' }}
        >
          <span
            className="font-normal italic"
            style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}
          >
            {firstName || 'Friend'}
          </span>
          , how can you be reached if necessary?
        </h2>
        <p className="mb-6 text-center text-sm" style={{ color: '#666' }}>
          Our medical teams and pharmacy use email and text for patient communication.
        </p>

        <div className="mb-6 w-full space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Email <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                &#9993;
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@email.com"
                className="wm-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '1rem' }}
              />
            </div>
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Phone Number <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                &#9742;
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                type="tel"
                placeholder="(555) 555-5555"
                className="wm-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '1rem' }}
              />
            </div>
            {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
          </div>
        </div>

        <div className="mb-4 w-full">
          <label htmlFor="consent-checkbox" className="flex cursor-pointer items-start gap-3">
            <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              <input
                id="consent-checkbox"
                type="checkbox"
                checked={consent}
                onChange={() => setConsent(!consent)}
                className="peer sr-only"
              />
              <span
                className="flex h-5 w-5 items-center justify-center rounded border-2"
                style={{
                  borderColor: consent ? '#c3b29e' : '#d1d5db',
                  backgroundColor: consent ? '#c3b29e' : 'transparent',
                  transition: 'all 0.08s ease',
                }}
                aria-hidden="true"
              >
                {consent && (
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </span>
            </span>
            <span className="text-xs leading-relaxed" style={{ color: '#555' }}>
              I understand that my information is never shared, is protected by HIPAA and agree to
              the terms and privacy policies and to be contacted as necessary by Wellmedr and its
              medical partners and can opt-out at anytime. By checking this box, you agree to
              receive recurring automated marketing text messages (e.g. AI content, cart reminders)
              from Wellmedr at the number you provide. Consent not a condition of purchase. We may
              share info with service providers per our Privacy Policy. Reply HELP for help & STOP
              to cancel. Msg frequency varies. Msg & data rates may apply. By clicking this button,
              you also agree to our{' '}
              <a
                href="https://www.wellmedr.com/termsandconditions"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms (incl. arbitration)
              </a>{' '}
              &{' '}
              <a
                href="https://www.wellmedr.com/privacypolicy"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>
          {errors.consent && <p className="mt-1 text-xs text-red-500">{errors.consent}</p>}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[600px] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-[31rem] sm:px-8">
        <button
          onClick={handleContinue}
          className="wm-next-btn flex w-full items-center justify-center gap-4 rounded-full py-[18px] text-base font-normal text-white active:scale-[0.98] sm:text-[1.125rem]"
          style={{ height: 56, backgroundColor: '#0C2631', cursor: 'pointer' }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
