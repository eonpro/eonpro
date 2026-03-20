'use client';

import { useState } from 'react';
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
  progressPercent,
}: WmContactInfoStepProps) {
  const router = useRouter();
  const responses = useIntakeStore((s) => s.responses);
  const { setResponses, markStepCompleted, setCurrentStep } = useIntakeActions();

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
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Valid email required';
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) e.phone = 'Valid phone required';
    if (!consent) e.consent = 'You must agree to continue';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (!validate()) return;
    setResponses({ email, phone, contact_consent: true });
    markStepCompleted('contact-info-wm');
    setCurrentStep(nextStep);
    router.push(`${basePath}/${nextStep}`);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#F7F7F9' }}>
      <div className="w-full h-1" style={{ backgroundColor: '#e5e0d8' }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: '#c3b29e' }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 lg:px-8 pt-8 pb-6 max-w-xl sm:max-w-2xl mx-auto w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wellmedr-logo.svg" alt="wellmedr." className="h-6 sm:h-7 mb-6 sm:mb-8" />

        <h2 className="text-[1.25rem] sm:text-[1.5rem] font-bold text-center mb-2" style={{ color: '#101010' }}>
          <span className="italic font-normal" style={{ color: '#7B95A9', fontFamily: "'BodoniSvtyTwo', serif" }}>{firstName || 'Friend'}</span>, how can you be reached if necessary?
        </h2>
        <p className="text-sm text-center mb-6" style={{ color: '#666' }}>Our medical teams and pharmacy use email and text for patient communication.</p>

        <div className="w-full space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Email <span className="text-red-400">*</span></label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">&#9993;</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@email.com" className="w-full h-14 pl-10 pr-4 rounded-2xl border bg-white text-base" style={{ borderColor: errors.email ? '#ef4444' : '#e5e7eb' }} />
            </div>
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Phone Number <span className="text-red-400">*</span></label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">&#9742;</span>
              <input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} type="tel" placeholder="(555) 555-5555" className="w-full h-14 pl-10 pr-4 rounded-2xl border bg-white text-base" style={{ borderColor: errors.phone ? '#ef4444' : '#e5e7eb' }} />
            </div>
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>
        </div>

        <div className="w-full mb-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <div onClick={() => setConsent(!consent)} className="w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0" style={{ borderColor: consent ? 'var(--intake-accent)' : '#d1d5db', backgroundColor: consent ? 'var(--intake-accent)' : 'transparent' }}>
              {consent && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
            </div>
            <span className="text-xs leading-relaxed" style={{ color: '#555' }}>
              I understand that my information is never shared, is protected by HIPAA and agree to the terms and privacy policies and to be contacted as necessary by Wellmedr and its medical partners and can opt-out at anytime. By checking this box, you agree to receive recurring automated marketing text messages (e.g. AI content, cart reminders) from Wellmedr at the number you provide. Consent not a condition of purchase. We may share info with service providers per our Privacy Policy. Reply HELP for help & STOP to cancel. Msg frequency varies. Msg & data rates may apply. By clicking this button, you also agree to our{' '}
              <a href="https://www.wellmedr.com/termsandconditions" className="underline" target="_blank" rel="noopener noreferrer">Terms (incl. arbitration)</a> &{' '}
              <a href="https://www.wellmedr.com/privacypolicy" className="underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
            </span>
          </label>
          {errors.consent && <p className="text-xs text-red-500 mt-1">{errors.consent}</p>}
        </div>
      </div>

      <div className="sticky bottom-0 px-5 sm:px-8 pb-6 pt-3 max-w-xl sm:max-w-2xl mx-auto w-full">
        <button
          onClick={handleContinue}
          disabled={!consent}
          className="w-full flex items-center justify-center gap-3 py-4 text-white font-medium text-base rounded-full active:scale-[0.98] transition-all disabled:opacity-40"
          style={{ backgroundColor: '#0C2631' }}
        >
          Next <span className="text-lg">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
