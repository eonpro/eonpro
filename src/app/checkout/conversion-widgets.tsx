'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Exit-Intent Popup — Shows when user moves cursor above viewport (desktop)
// or after inactivity on mobile. Only fires once per session.
// ============================================================================

const exitIntentTranslations = {
  en: {
    title: "Wait! Don't miss out",
    subtitle:
      'Your personalized treatment plan is ready. Complete your order now and start your transformation.',
    cta: 'Complete My Order',
    dismiss: 'No thanks',
    urgency: 'Your selections are saved for the next 15 minutes',
  },
  es: {
    title: '¡Espera! No te lo pierdas',
    subtitle:
      'Tu plan de tratamiento personalizado está listo. Completa tu pedido ahora y comienza tu transformación.',
    cta: 'Completar Mi Pedido',
    dismiss: 'No, gracias',
    urgency: 'Tus selecciones están guardadas por los próximos 15 minutos',
  },
};

export function ExitIntentPopup({
  language,
  primaryColor,
  onStay,
}: {
  language: 'en' | 'es';
  primaryColor: string;
  onStay: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const firedRef = useRef(false);
  const t = exitIntentTranslations[language];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const already = sessionStorage.getItem('exit_intent_shown');
    if (already) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !firedRef.current) {
        firedRef.current = true;
        sessionStorage.setItem('exit_intent_shown', '1');
        setVisible(true);
      }
    };

    let inactivityTimer: ReturnType<typeof setTimeout>;
    const resetInactivity = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (!firedRef.current) {
          firedRef.current = true;
          sessionStorage.setItem('exit_intent_shown', '1');
          setVisible(true);
        }
      }, 60000);
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('touchstart', resetInactivity);
    document.addEventListener('scroll', resetInactivity);
    resetInactivity();

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('touchstart', resetInactivity);
      document.removeEventListener('scroll', resetInactivity);
      clearTimeout(inactivityTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl duration-300">
        <button
          onClick={() => setVisible(false)}
          className="absolute right-4 top-4 text-gray-400 transition hover:text-gray-600"
          aria-label="Close"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: `${primaryColor}15` }}
          >
            <svg
              className="h-8 w-8"
              style={{ color: primaryColor }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>

          <h2 className="mb-2 text-2xl font-bold text-gray-900">{t.title}</h2>
          <p className="mb-6 text-sm text-gray-500">{t.subtitle}</p>

          <button
            onClick={() => {
              setVisible(false);
              onStay();
            }}
            className="mb-3 w-full rounded-full py-3.5 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            {t.cta}
          </button>
          <button
            onClick={() => setVisible(false)}
            className="w-full py-2 text-sm text-gray-400 transition hover:text-gray-600"
          >
            {t.dismiss}
          </button>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{t.urgency}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Social Proof Toast — "Maria from Miami just started..."
// ============================================================================

const SOCIAL_PROOF_NAMES = [
  { name: 'Maria', city: 'Miami' },
  { name: 'Jessica', city: 'Houston' },
  { name: 'Ashley', city: 'Phoenix' },
  { name: 'Sarah', city: 'Dallas' },
  { name: 'Amanda', city: 'Orlando' },
  { name: 'Stephanie', city: 'Atlanta' },
  { name: 'Lauren', city: 'Tampa' },
  { name: 'Daniela', city: 'Los Angeles' },
  { name: 'Emily', city: 'Charlotte' },
  { name: 'Melissa', city: 'San Antonio' },
  { name: 'Rachel', city: 'Las Vegas' },
  { name: 'Nicole', city: 'Nashville' },
];

const socialProofTranslations = {
  en: {
    justStarted: 'just started their weight loss journey',
    minutesAgo: 'min ago',
    verified: 'Verified Patient',
  },
  es: {
    justStarted: 'acaba de comenzar su camino de pérdida de peso',
    minutesAgo: 'min atrás',
    verified: 'Paciente Verificado',
  },
};

export function SocialProofToast({ language }: { language: 'en' | 'es' }) {
  const [current, setCurrent] = useState<{ name: string; city: string; minutes: number } | null>(
    null
  );
  const [visible, setVisible] = useState(false);
  const indexRef = useRef(0);
  const t = socialProofTranslations[language];

  useEffect(() => {
    const shuffled = [...SOCIAL_PROOF_NAMES].sort(() => Math.random() - 0.5);

    const showNext = () => {
      const person = shuffled[indexRef.current % shuffled.length];
      const minutes = Math.floor(Math.random() * 12) + 2;
      setCurrent({ ...person, minutes });
      setVisible(true);
      indexRef.current++;

      setTimeout(() => setVisible(false), 4500);
    };

    const initialDelay = setTimeout(showNext, 8000);
    const interval = setInterval(showNext, 22000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, []);

  if (!current) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 z-50 max-w-xs rounded-xl border border-gray-100 bg-white p-3.5 shadow-lg transition-all duration-500 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
          {current.name[0]}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {current.name} {language === 'en' ? 'from' : 'de'} {current.city}
          </p>
          <p className="text-xs text-gray-500">{t.justStarted}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] text-gray-400">
              {current.minutes} {t.minutesAgo}
            </span>
            <span className="flex items-center gap-0.5 text-[10px] text-green-600">
              <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              {t.verified}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Trust Badges — SSL, HIPAA, Licensed Physicians, Card Logos
// ============================================================================

const trustTranslations = {
  en: {
    ssl: 'SSL Encrypted',
    hipaa: 'HIPAA Compliant',
    physicians: 'Licensed Physicians',
    securePayment: 'Secure Payment',
  },
  es: {
    ssl: 'Cifrado SSL',
    hipaa: 'Cumple HIPAA',
    physicians: 'Médicos Licenciados',
    securePayment: 'Pago Seguro',
  },
};

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function StethoscopeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  );
}

export function TrustBadges({ language }: { language: 'en' | 'es' }) {
  const t = trustTranslations[language];

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: LockIcon, label: t.ssl, color: '#10B981' },
          { icon: ShieldIcon, label: t.hipaa, color: '#3B82F6' },
          { icon: StethoscopeIcon, label: t.physicians, color: '#8B5CF6' },
        ].map(({ icon: Icon, label, color }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50/50 px-2 py-3 text-center"
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: `${color}15` }}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-medium leading-tight text-gray-600">{label}</span>
          </div>
        ))}
      </div>

      {/* Card logos */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <span className="text-[10px] text-gray-400">{t.securePayment}</span>
        <div className="flex items-center gap-2">
          {['Visa', 'MC', 'Amex', 'Discover'].map((brand) => (
            <div
              key={brand}
              className="flex h-6 items-center rounded border border-gray-200 bg-white px-1.5 text-[9px] font-bold text-gray-500"
            >
              {brand}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sticky Order Summary Bar — Fixed bottom bar on mobile with total + CTA
// ============================================================================

export function StickyOrderBar({
  total,
  primaryColor,
  ctaLabel,
  onClick,
  disabled,
  visible,
}: {
  total: number;
  primaryColor: string;
  ctaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  visible: boolean;
}) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 200);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!visible || !isScrolled) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur-md sm:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-lg font-bold" style={{ color: primaryColor }}>
            ${total.toFixed(2)}
          </p>
        </div>
        <button
          onClick={onClick}
          disabled={disabled}
          className="flex-1 rounded-full py-3 text-center text-sm font-semibold text-white transition disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Countdown Timer — Urgency timer for promo codes
// ============================================================================

const countdownTranslations = {
  en: { expires: 'Offer expires in', expired: 'Offer expired' },
  es: { expires: 'Oferta expira en', expired: 'Oferta expirada' },
};

export function CountdownTimer({
  language,
  durationMinutes = 15,
  onExpire,
  active,
}: {
  language: 'en' | 'es';
  durationMinutes?: number;
  onExpire: () => void;
  active: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const t = countdownTranslations[language];
  const endTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setRemaining(null);
      endTimeRef.current = null;
      return;
    }

    const stored = sessionStorage.getItem('promo_countdown_end');
    const endTime = stored ? parseInt(stored, 10) : Date.now() + durationMinutes * 60 * 1000;

    if (!stored) {
      sessionStorage.setItem('promo_countdown_end', String(endTime));
    }
    endTimeRef.current = endTime;

    const tick = () => {
      const left = Math.max(0, endTime - Date.now());
      setRemaining(Math.ceil(left / 1000));
      if (left <= 0) {
        sessionStorage.removeItem('promo_countdown_end');
        onExpire();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [active, durationMinutes, onExpire]);

  if (!active || remaining === null) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isLow = remaining < 120;

  if (remaining <= 0) {
    return <p className="mt-1 text-xs font-medium text-red-500">{t.expired}</p>;
  }

  return (
    <div
      className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${isLow ? 'text-red-500' : 'text-orange-500'}`}
    >
      <svg
        className="h-3.5 w-3.5 animate-pulse"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>
        {t.expires} {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}

// ============================================================================
// Auto-Save + "Continue Where You Left Off" Modal
// ============================================================================

const CHECKOUT_AUTOSAVE_KEY = 'checkout_autosave';

export type CheckoutAutoSaveData = {
  medication: string;
  selectedDose: string;
  selectedPlan: string;
  selectedAddons: string[];
  expeditedShipping: boolean;
  promoCode: string;
  promoApplied: boolean;
  currentStep: number;
  savedAt: number;
};

export function saveCheckoutState(data: Omit<CheckoutAutoSaveData, 'savedAt'>) {
  try {
    localStorage.setItem(CHECKOUT_AUTOSAVE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function loadCheckoutState(): CheckoutAutoSaveData | null {
  try {
    const raw = localStorage.getItem(CHECKOUT_AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CheckoutAutoSaveData;
    const hoursSince = (Date.now() - data.savedAt) / (1000 * 60 * 60);
    if (hoursSince > 24) {
      localStorage.removeItem(CHECKOUT_AUTOSAVE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearCheckoutState() {
  try {
    localStorage.removeItem(CHECKOUT_AUTOSAVE_KEY);
  } catch {
    /* noop */
  }
}

const resumeTranslations = {
  en: {
    title: 'Continue where you left off?',
    subtitle: 'We saved your previous selections. Would you like to pick up where you left off?',
    resume: 'Yes, continue',
    startFresh: 'Start fresh',
  },
  es: {
    title: '¿Continuar donde lo dejaste?',
    subtitle: 'Guardamos tus selecciones anteriores. ¿Deseas continuar donde lo dejaste?',
    resume: 'Sí, continuar',
    startFresh: 'Empezar de nuevo',
  },
};

export function ResumeModal({
  language,
  primaryColor,
  onResume,
  onStartFresh,
}: {
  language: 'en' | 'es';
  primaryColor: string;
  onResume: () => void;
  onStartFresh: () => void;
}) {
  const t = resumeTranslations[language];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
          <svg
            className="h-6 w-6 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
        </div>
        <h3 className="mb-1 text-lg font-bold text-gray-900">{t.title}</h3>
        <p className="mb-6 text-sm text-gray-500">{t.subtitle}</p>

        <button
          onClick={onResume}
          className="mb-2 w-full rounded-full py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          style={{ backgroundColor: primaryColor }}
        >
          {t.resume}
        </button>
        <button
          onClick={onStartFresh}
          className="w-full rounded-full border border-gray-200 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
        >
          {t.startFresh}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Referral Code — Shown on Thank-You page
// ============================================================================

const referralTranslations = {
  en: {
    title: 'Share & Save',
    subtitle: 'Give your friends $25 off their first order. Share your referral code:',
    copied: 'Copied!',
    copy: 'Copy Code',
    share: 'Share Link',
  },
  es: {
    title: 'Comparte y Ahorra',
    subtitle:
      'Dale a tus amigos $25 de descuento en su primer pedido. Comparte tu código de referido:',
    copied: '¡Copiado!',
    copy: 'Copiar Código',
    share: 'Compartir Enlace',
  },
};

function generateReferralCode(): string {
  const stored = localStorage.getItem('eonmeds_referral_code');
  if (stored) return stored;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'EON';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  localStorage.setItem('eonmeds_referral_code', code);
  return code;
}

export function ReferralCodeCard({
  language,
  primaryColor,
}: {
  language: 'en' | 'es';
  primaryColor: string;
}) {
  const t = referralTranslations[language];
  const [code] = useState(() => generateReferralCode());
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback for older browsers */
    }
  }, [code]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: 'EONMeds Weight Loss',
      text:
        language === 'en'
          ? `Use my code ${code} to get $25 off your first order at EONMeds!`
          : `¡Usa mi código ${code} para obtener $25 de descuento en tu primer pedido en EONMeds!`,
      url: `https://eonmeds.eonpro.io/intake?ref=${code}`,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* user cancelled */
      }
    } else {
      handleCopy();
    }
  }, [code, language, handleCopy]);

  return (
    <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
        <svg
          className="h-5 w-5 text-amber-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
      </div>
      <h3 className="mb-1 text-base font-bold text-gray-900">{t.title}</h3>
      <p className="mb-4 text-xs text-gray-500">{t.subtitle}</p>

      <div
        className="mb-4 inline-flex items-center gap-2 rounded-lg border-2 border-dashed px-5 py-2.5"
        style={{ borderColor: primaryColor }}
      >
        <span
          className="font-mono text-xl font-bold tracking-wider"
          style={{ color: primaryColor }}
        >
          {code}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 rounded-full border border-gray-200 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
        >
          {copied ? t.copied : t.copy}
        </button>
        <button
          onClick={handleShare}
          className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          style={{ backgroundColor: primaryColor }}
        >
          {t.share}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ZIP Code Auto-Fill — Fetches city/state from ZIP via Zippopotam.us
// ============================================================================

export async function lookupZipCode(zip: string): Promise<{ city: string; state: string } | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) return null;
    return {
      city: place['place name'] || '',
      state: place['state abbreviation'] || '',
    };
  } catch {
    return null;
  }
}

// ============================================================================
// SMS Opt-In Checkbox
// ============================================================================

const smsTranslations = {
  en: {
    label: 'Text me order updates & health tips',
    disclosure:
      'By checking this box, you agree to receive SMS messages from EONMeds. Message & data rates may apply. Reply STOP to unsubscribe.',
  },
  es: {
    label: 'Envíame actualizaciones por mensaje de texto',
    disclosure:
      'Al marcar esta casilla, aceptas recibir mensajes SMS de EONMeds. Pueden aplicarse tarifas de mensajes y datos. Responde STOP para cancelar.',
  },
};

export function SmsOptIn({
  language,
  checked,
  onChange,
  primaryColor,
}: {
  language: 'en' | 'es';
  checked: boolean;
  onChange: (checked: boolean) => void;
  primaryColor: string;
}) {
  const t = smsTranslations[language];

  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded"
          style={{ accentColor: primaryColor }}
        />
        <div>
          <span className="text-sm font-medium text-gray-700">{t.label}</span>
          <p className="mt-0.5 text-[10px] leading-relaxed text-gray-400">{t.disclosure}</p>
        </div>
      </label>
    </div>
  );
}
