'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { LanguageProvider, useLanguage } from '@/domains/intake/contexts/LanguageContext';
import semaglutideConfig from '@/domains/intake/config/products/semaglutide';
import type { ProductConfig, DoseWithPlans, DosePlanOption, AddonConfig } from '@/domains/intake/config/products/types';

// ============================================================================
// Stripe
// ============================================================================

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_EONMEDS_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    '',
);

// ============================================================================
// Translations
// ============================================================================

const T: Record<string, { en: string; es: string }> = {
  congratulations: {
    en: 'Congratulations! You qualify for treatment',
    es: '¡Felicitaciones! Califica para el tratamiento',
  },
  selectDose: { en: 'Select Your Dose', es: 'Seleccione Su Dosis' },
  doseSubtitle: {
    en: "Choose the dosage that's right for you",
    es: 'Elija la dosis adecuada para usted',
  },
  selectPlan: { en: 'Select Your Plan', es: 'Seleccione Su Plan' },
  planSubtitle: {
    en: 'Choose your subscription plan',
    es: 'Elija su plan de suscripción',
  },
  optionalAddons: { en: 'Optional Add-ons', es: 'Complementos Opcionales' },
  promoCode: { en: 'Promo code', es: 'Código promocional' },
  applyPromo: { en: 'Apply', es: 'Aplicar' },
  promoApplied: { en: 'Promo applied!', es: '¡Código aplicado!' },
  promoInvalid: { en: 'Invalid code', es: 'Código inválido' },
  orderSummary: { en: 'Order Summary', es: 'Resumen del Pedido' },
  subtotal: { en: 'Subtotal', es: 'Subtotal' },
  shipping: { en: 'Shipping', es: 'Envío' },
  shippingFree: { en: 'FREE', es: 'GRATIS' },
  discount: { en: 'Discount', es: 'Descuento' },
  total: { en: 'Total', es: 'Total' },
  continueShipping: { en: 'Continue to Shipping', es: 'Continuar a Envío' },
  continuePayment: { en: 'Continue to Payment', es: 'Continuar a Pago' },
  completePurchase: { en: 'Complete Purchase', es: 'Completar Compra' },
  back: { en: 'Back', es: 'Atrás' },
  shippingTitle: { en: 'Shipping Information', es: 'Información de Envío' },
  shippingSubtitle: {
    en: 'Enter your shipping details',
    es: 'Ingrese sus datos de envío',
  },
  firstName: { en: 'First Name', es: 'Nombre' },
  lastName: { en: 'Last Name', es: 'Apellido' },
  email: { en: 'Email', es: 'Correo Electrónico' },
  phone: { en: 'Phone', es: 'Teléfono' },
  address: { en: 'Street Address', es: 'Dirección' },
  address2: { en: 'Apt / Suite (optional)', es: 'Apto / Suite (opcional)' },
  city: { en: 'City', es: 'Ciudad' },
  state: { en: 'State', es: 'Estado' },
  zip: { en: 'ZIP Code', es: 'Código Postal' },
  paymentTitle: { en: 'Payment', es: 'Pago' },
  paymentSubtitle: {
    en: 'Complete your purchase securely',
    es: 'Completa tu compra de forma segura',
  },
  processing: { en: 'Processing...', es: 'Procesando...' },
  thankYou: { en: 'Thank You!', es: '¡Gracias!' },
  orderConfirmed: {
    en: 'Your order has been confirmed',
    es: 'Tu pedido ha sido confirmado',
  },
  orderDetails: { en: 'Order Details', es: 'Detalles del Pedido' },
  medication: { en: 'Medication', es: 'Medicamento' },
  dose: { en: 'Dose', es: 'Dosis' },
  plan: { en: 'Plan', es: 'Plan' },
  addons: { en: 'Add-ons', es: 'Complementos' },
  confirmationEmail: {
    en: 'A confirmation email will be sent to',
    es: 'Se enviará un correo de confirmación a',
  },
  perMonth: { en: '/mo', es: '/mes' },
  oneTime: { en: 'one-time', es: 'pago único' },
  threeMonth: { en: '3-month package', es: 'paquete de 3 meses' },
  starterDose: { en: 'Starter Dose', es: 'Dosis Inicial' },
  higherDose: { en: 'Higher Dose', es: 'Dosis Superior' },
  recommendedNew: {
    en: 'Recommended for new patients',
    es: 'Recomendado para nuevos pacientes',
  },
  forContinuing: {
    en: 'For continuing patients',
    es: 'Para pacientes continuando',
  },
  medicalConsultation: {
    en: 'Medical consultation included',
    es: 'Consulta médica incluida',
  },
  freeShipping: {
    en: 'Free standard shipping',
    es: 'Envío estándar gratis',
  },
  whatsNext: { en: "What's Next", es: 'Próximos Pasos' },
  whatsNextStep1: {
    en: 'A licensed provider will review your information within 24 hours',
    es: 'Un proveedor con licencia revisará su información dentro de 24 horas',
  },
  whatsNextStep2: {
    en: 'Once approved, your medication will be shipped to you',
    es: 'Una vez aprobado, su medicamento le será enviado',
  },
  whatsNextStep3: {
    en: 'You will receive tracking information via email',
    es: 'Recibirá información de seguimiento por correo electrónico',
  },
  monthlyRecurring: { en: '/month recurring', es: '/mes recurrente' },
  onePayment: { en: ' one payment', es: ' pago único' },
  oneTimeBilling: { en: ' one-time', es: ' compra única' },
  save: { en: 'Save', es: 'Ahorra' },
  startingAt: { en: 'Starting at', es: 'Desde' },
  recommended: { en: 'Recommended', es: 'Recomendado' },
};

// ============================================================================
// Flag SVGs
// ============================================================================

const US_FLAG = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" width="24" height="12">
    <clipPath id="us"><rect width="60" height="30" /></clipPath>
    <g clipPath="url(#us)">
      <rect width="60" height="30" fill="#bf0a30" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} y={i * 30 / 13 * 2} width="60" height={30 / 13} fill="#fff" />
      ))}
      <rect width="24" height={30 * 7 / 13} fill="#002868" />
    </g>
  </svg>
);

const ES_FLAG = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" width="24" height="16">
    <rect width="60" height="40" fill="#c60b1e" />
    <rect y="10" width="60" height="20" fill="#ffc400" />
  </svg>
);

// ============================================================================
// Language Toggle
// ============================================================================

function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
      className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-medium shadow-md transition hover:shadow-lg"
    >
      {language === 'en' ? ES_FLAG : US_FLAG}
      <span>{language === 'en' ? 'Español' : 'English'}</span>
    </button>
  );
}

// ============================================================================
// Prefill helpers
// ============================================================================

function getSessionValue(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

// ============================================================================
// CheckoutInner
// ============================================================================

export function CheckoutInner() {
  const { language } = useLanguage();
  const t = useCallback(
    (key: string) => T[key]?.[language] || T[key]?.en || key,
    [language],
  );
  const searchParams = useSearchParams();

  const medicationParam = searchParams.get('medication') || 'semaglutide';
  const config: ProductConfig = semaglutideConfig;
  const primaryColor = config.branding.primaryColor;
  const doses = config.dosesWithPlans || [];
  const hasDoseSelection = doses.length > 0;

  // Step state
  const [step, setStep] = useState(1);

  // Dose & plan
  const [selectedDose, setSelectedDose] = useState<DoseWithPlans | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<DosePlanOption | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  // Promo
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoInvalid, setPromoInvalid] = useState(false);

  // Patient info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Shipping address
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');

  // Payment
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);

  // Body class for intake styles
  useEffect(() => {
    document.body.classList.add('intake-body');
    return () => document.body.classList.remove('intake-body');
  }, []);

  // Prefill from URL params + sessionStorage
  useEffect(() => {
    setFirstName(
      searchParams.get('firstName') ||
        getSessionValue('intake_firstName') ||
        '',
    );
    setLastName(
      searchParams.get('lastName') ||
        getSessionValue('intake_lastName') ||
        '',
    );
    setEmail(
      searchParams.get('email') ||
        getSessionValue('intake_email') ||
        '',
    );
    setPhone(
      searchParams.get('phone') ||
        getSessionValue('intake_phone') ||
        '',
    );

    // Defaults
    const defaultDose =
      doses.find((d) => d.id === config.defaultDoseId) || doses[0];
    if (defaultDose) {
      setSelectedDose(defaultDose);
      const defaultPlan =
        defaultDose.plans.find((p) => p.id === config.defaultPlanId) ||
        defaultDose.plans[0];
      if (defaultPlan) setSelectedPlan(defaultPlan);
    }
  }, [searchParams]);

  // Addon total
  const addonsTotal = useMemo(() => {
    return config.addons
      .filter((a) => selectedAddons.includes(a.id))
      .reduce((sum, a) => {
        let price = a.basePrice;
        if (a.hasDuration && selectedPlan) {
          if (selectedPlan.type === '3month') price *= 3;
          if (selectedPlan.type === '6month') price *= 6;
        }
        return sum + price;
      }, 0);
  }, [selectedAddons, selectedPlan]);

  const promoDiscount = promoApplied ? 25 : 0;
  const subtotal = (selectedPlan?.price || 0) + addonsTotal;
  const orderTotal = Math.max(0, subtotal - promoDiscount);

  // Promo validation
  const handleApplyPromo = () => {
    const allowed = new Set(['EON25', 'SAVE25', 'WELCOME']);
    if (allowed.has(promoCode.toUpperCase())) {
      setPromoApplied(true);
      setPromoInvalid(false);
    } else {
      setPromoInvalid(true);
    }
  };

  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  // Validation
  const canProceedStep1 = selectedPlan && (!hasDoseSelection || selectedDose);
  const canProceedStep2 =
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    phone.trim() &&
    address1.trim() &&
    city.trim() &&
    state.trim() &&
    zip.trim();

  // Create payment intent and go to step 3
  const handleContinueToPayment = async () => {
    if (!canProceedStep2 || !selectedPlan) return;
    setIsCreatingIntent(true);
    setPaymentError(null);

    try {
      const res = await fetch('/api/checkout/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: orderTotal * 100,
          currency: 'usd',
          customer_email: email,
          customer_name: `${firstName} ${lastName}`,
          customer_phone: phone,
          shipping_address: {
            addressLine1: address1,
            addressLine2: address2,
            city,
            state,
            zipCode: zip,
            country: 'US',
          },
          order_data: {
            medication: config.name,
            dose: selectedDose?.strength,
            plan:
              language === 'en' ? selectedPlan.nameEn : selectedPlan.nameEs,
            addons: config.addons
              .filter((a) => selectedAddons.includes(a.id))
              .map((a) => a.nameEn),
            subtotal,
            discount: promoDiscount,
            total: orderTotal,
          },
          metadata: { product_id: config.id },
          language,
        }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.message || data.error || 'Payment setup failed');

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setStep(3);
    } catch (err: unknown) {
      setPaymentError(
        err instanceof Error ? err.message : 'Failed to initialize payment',
      );
    } finally {
      setIsCreatingIntent(false);
    }
  };

  // ========================================================================
  // Thank You
  // ========================================================================
  if (paymentSucceeded) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-10 w-10 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="page-title mb-2">{t('thankYou')}</h1>
        <p className="page-subtitle mb-8">{t('orderConfirmed')}</p>

        {/* Order details */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            {t('orderDetails')}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('medication')}</span>
              <span className="font-medium text-gray-900">{config.name}</span>
            </div>
            {selectedDose && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t('dose')}</span>
                <span className="font-medium text-gray-900">
                  {selectedDose.strength}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">{t('plan')}</span>
              <span className="font-medium text-gray-900">
                {language === 'en'
                  ? selectedPlan?.nameEn
                  : selectedPlan?.nameEs}
              </span>
            </div>
            {selectedAddons.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t('addons')}</span>
                <span className="font-medium text-gray-900">
                  {config.addons
                    .filter((a) => selectedAddons.includes(a.id))
                    .map((a) =>
                      language === 'en' ? a.nameEn : a.nameEs,
                    )
                    .join(', ')}
                </span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex justify-between text-base font-semibold">
                <span>{t('total')}</span>
                <span className="text-green-600">${orderTotal}</span>
              </div>
            </div>
          </div>
        </div>

        {/* What's Next */}
        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            {t('whatsNext')}
          </h3>
          <div className="space-y-4">
            {[
              t('whatsNextStep1'),
              t('whatsNextStep2'),
              t('whatsNextStep3'),
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {i + 1}
                </div>
                <p className="text-sm text-gray-600 pt-0.5">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          {t('confirmationEmail')} <strong>{email}</strong>
        </p>
      </div>
    );
  }

  // ========================================================================
  // Checkout Flow
  // ========================================================================
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <LanguageToggle />

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center gap-3">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  s < step
                    ? 'text-white'
                    : s === step
                      ? 'text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
                style={{
                  backgroundColor: s <= step ? primaryColor : undefined,
                }}
              >
                {s < step ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  s
                )}
              </div>
              {s < 3 && (
                <div
                  className="h-1 w-12 rounded-full transition-colors"
                  style={{
                    backgroundColor: s < step ? primaryColor : '#e5e7eb',
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* STEP 1 — Dose & Plan                                            */}
      {/* ================================================================ */}
      {step === 1 && (
        <div>
          {/* Congratulations header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-7 w-7 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="page-title mb-1">{t('congratulations')}</h1>
            <p className="page-subtitle">{config.name}</p>
          </div>

          {/* Product info bar */}
          <div className="mb-6 rounded-xl bg-gray-50 p-4">
            <h3 className="font-semibold text-gray-900">{config.name}</h3>
            <p className="text-sm text-gray-600">
              {language === 'es' ? config.taglineEs : config.taglineEn}
            </p>
            {config.efficacy && (
              <p className="mt-1 text-sm font-medium" style={{ color: primaryColor }}>
                {language === 'es' ? config.efficacyEs : config.efficacy}
              </p>
            )}
          </div>

          {/* Dose selection */}
          {hasDoseSelection && (
            <div className="mb-8">
              <h2 className="mb-1 text-lg font-bold text-gray-900">
                {t('selectDose')}
              </h2>
              <p className="mb-4 text-sm text-gray-500">
                {t('doseSubtitle')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {doses.map((dose) => (
                  <DoseCard
                    key={dose.id}
                    dose={dose}
                    isSelected={selectedDose?.id === dose.id}
                    onSelect={() => {
                      setSelectedDose(dose);
                      const firstPlan = dose.plans[0];
                      if (firstPlan) setSelectedPlan(firstPlan);
                    }}
                    language={language}
                    primaryColor={primaryColor}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Plan selection */}
          {selectedDose && (
            <div className="mb-8">
              <h2 className="mb-1 text-lg font-bold text-gray-900">
                {t('selectPlan')}
              </h2>
              <p className="mb-4 text-sm text-gray-500">
                {t('planSubtitle')}
              </p>
              <div className="space-y-3">
                {selectedDose.plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    isSelected={selectedPlan?.id === plan.id}
                    onSelect={() => setSelectedPlan(plan)}
                    language={language}
                    primaryColor={primaryColor}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add-ons */}
          {config.features?.enableAddons && config.addons.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-bold text-gray-900">
                {t('optionalAddons')}
              </h2>
              <div className="space-y-3">
                {config.addons.map((addon) => (
                  <AddonCard
                    key={addon.id}
                    addon={addon}
                    selected={selectedAddons.includes(addon.id)}
                    onToggle={() => toggleAddon(addon.id)}
                    language={language}
                    selectedPlan={selectedPlan}
                    primaryColor={primaryColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Promo code */}
          {config.features?.enablePromoCode && (
            <div className="mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    setPromoInvalid(false);
                  }}
                  placeholder={t('promoCode')}
                  className="input-field flex-1"
                  disabled={promoApplied}
                />
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  disabled={promoApplied || !promoCode.trim()}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  {promoApplied ? t('promoApplied') : t('applyPromo')}
                </button>
              </div>
              {promoInvalid && (
                <p className="mt-1 text-sm text-red-500">{t('promoInvalid')}</p>
              )}
            </div>
          )}

          {/* Order Summary */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('orderSummary')}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('subtotal')}</span>
                <span className="font-medium text-gray-900">
                  ${subtotal.toFixed(2)}
                </span>
              </div>
              {addonsTotal > 0 && (
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{t('optionalAddons')}</span>
                  <span>+${addonsTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">{t('shipping')}</span>
                <span className="font-medium text-green-600">
                  {t('shippingFree')}
                </span>
              </div>
              {promoApplied && (
                <div className="flex justify-between text-green-600">
                  <span>{t('discount')}</span>
                  <span>-${promoDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2">
                <div className="flex justify-between text-base font-bold">
                  <span>{t('total')}</span>
                  <span style={{ color: primaryColor }}>
                    ${orderTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Included benefits */}
          <div className="mb-6 space-y-2 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('medicalConsultation')}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('freeShipping')}</span>
            </div>
          </div>

          {/* Continue button */}
          <button
            type="button"
            disabled={!canProceedStep1}
            onClick={() => setStep(2)}
            className="continue-button"
          >
            {t('continueShipping')}
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 2 — Shipping                                               */}
      {/* ================================================================ */}
      {step === 2 && (
        <div>
          <h1 className="page-title mb-1 text-center">
            {t('shippingTitle')}
          </h1>
          <p className="page-subtitle mb-8 text-center">
            {t('shippingSubtitle')}
          </p>

          <div className="space-y-4">
            {/* Name row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('firstName')}
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input-field"
                  placeholder={t('firstName')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('lastName')}
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input-field"
                  placeholder={t('lastName')}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder={t('email')}
              />
            </div>

            {/* Phone */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('phone')}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field"
                placeholder="(555) 123-4567"
              />
            </div>

            {/* Address */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('address')}
              </label>
              <input
                type="text"
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                className="input-field"
                placeholder={t('address')}
                id="checkout-address-autocomplete"
              />
            </div>

            {/* Apt */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('address2')}
              </label>
              <input
                type="text"
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                className="input-field"
                placeholder={t('address2')}
              />
            </div>

            {/* City / State / Zip */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('city')}
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="input-field"
                  placeholder={t('city')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('state')}
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="input-field"
                  placeholder={t('state')}
                  maxLength={2}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('zip')}
                </label>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  className="input-field"
                  placeholder="12345"
                  maxLength={5}
                />
              </div>
            </div>
          </div>

          {paymentError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {paymentError}
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-gray-300 px-6 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {t('back')}
            </button>
            <button
              type="button"
              disabled={!canProceedStep2 || isCreatingIntent}
              onClick={handleContinueToPayment}
              className="continue-button flex-1"
            >
              {isCreatingIntent
                ? t('processing')
                : t('continuePayment')}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 3 — Payment                                                */}
      {/* ================================================================ */}
      {step === 3 && clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: primaryColor,
                borderRadius: '12px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              },
            },
          }}
        >
          <PaymentStep
            clientSecret={clientSecret}
            paymentIntentId={paymentIntentId}
            orderTotal={orderTotal}
            subtotal={subtotal}
            addonsTotal={addonsTotal}
            promoDiscount={promoDiscount}
            selectedDose={selectedDose}
            selectedPlan={selectedPlan}
            selectedAddons={selectedAddons}
            addons={config.addons}
            productName={config.name}
            primaryColor={primaryColor}
            language={language}
            t={t}
            onBack={() => setStep(2)}
            onSuccess={() => setPaymentSucceeded(true)}
          />
        </Elements>
      )}
    </div>
  );
}

// ============================================================================
// DoseCard
// ============================================================================

function DoseCard({
  dose,
  isSelected,
  onSelect,
  language,
  primaryColor,
  t,
}: {
  dose: DoseWithPlans;
  isSelected: boolean;
  onSelect: () => void;
  language: string;
  primaryColor: string;
  t: (key: string) => string;
}) {
  const startingPrice =
    dose.plans.length > 0 ? Math.min(...dose.plans.map((p) => p.price)) : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative rounded-xl border-2 p-5 text-left transition-all ${
        isSelected
          ? 'shadow-lg'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
      style={{
        borderColor: isSelected ? primaryColor : undefined,
        backgroundColor: isSelected ? `${primaryColor}08` : undefined,
      }}
    >
      {dose.isStarterDose && (
        <span
          className="absolute -top-2.5 right-4 rounded-full px-3 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {t('recommended')}
        </span>
      )}

      <div
        className="mb-1 text-2xl font-bold"
        style={{ color: isSelected ? primaryColor : undefined }}
      >
        {dose.strength}
      </div>
      <div className="font-semibold text-gray-900">
        {dose.isStarterDose ? t('starterDose') : t('higherDose')}
      </div>
      <p className="mb-3 mt-2 text-sm text-gray-500">{dose.description}</p>
      <div className="text-sm">
        <span className="text-gray-400">{t('startingAt')} </span>
        <span className="text-lg font-bold text-gray-900">
          ${startingPrice}
        </span>
        <span className="text-gray-400">/{language === 'es' ? 'mes' : 'mo'}</span>
      </div>

      {isSelected && (
        <div
          className="absolute left-4 top-4 flex h-5 w-5 items-center justify-center rounded-full"
          style={{ backgroundColor: primaryColor }}
        >
          <svg
            className="h-3 w-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      )}
    </button>
  );
}

// ============================================================================
// PlanCard
// ============================================================================

function PlanCard({
  plan,
  isSelected,
  onSelect,
  language,
  primaryColor,
  t,
}: {
  plan: DosePlanOption;
  isSelected: boolean;
  onSelect: () => void;
  language: string;
  primaryColor: string;
  t: (key: string) => string;
}) {
  const planName = language === 'es' ? plan.nameEs : plan.nameEn;
  const badge = language === 'es' ? (plan.badgeEs || plan.badge) : plan.badge;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full rounded-xl border-2 p-4 text-left transition-all ${
        isSelected
          ? 'shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      style={{
        borderColor: isSelected ? primaryColor : undefined,
        backgroundColor: isSelected ? `${primaryColor}08` : undefined,
      }}
    >
      {badge && (
        <span
          className="absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {badge}
        </span>
      )}

      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-gray-900">{planName}</span>
        </div>
        <div className="text-right">
          <span
            className="text-xl font-bold"
            style={{ color: isSelected ? primaryColor : undefined }}
          >
            ${plan.price}
          </span>
          <span className="ml-1 text-sm text-gray-500">
            {plan.billing === 'monthly' && (language === 'es' ? '/mes' : '/mo')}
            {plan.billing === 'total' &&
              (language === 'es' ? ' pago único' : ' one payment')}
            {plan.billing === 'once' &&
              (language === 'es' ? ' compra única' : ' one-time')}
          </span>
        </div>
      </div>

      {plan.savings && plan.savings > 0 && (
        <p className="mt-1 text-sm font-medium" style={{ color: primaryColor }}>
          {t('save')} ${plan.savings}
        </p>
      )}

      {isSelected && (
        <div className="absolute right-3 top-3">
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full"
            style={{ backgroundColor: primaryColor }}
          >
            <svg
              className="h-3 w-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>
      )}
    </button>
  );
}

// ============================================================================
// AddonCard
// ============================================================================

function AddonCard({
  addon,
  selected,
  onToggle,
  language,
  selectedPlan,
  primaryColor,
}: {
  addon: AddonConfig;
  selected: boolean;
  onToggle: () => void;
  language: string;
  selectedPlan: DosePlanOption | null;
  primaryColor: string;
}) {
  const name = language === 'es' ? addon.nameEs : addon.nameEn;
  const description =
    language === 'es' ? addon.descriptionEs : addon.descriptionEn;

  const iconMap: Record<string, string> = {
    pill: '💊',
    flame: '🔥',
    heart: '❤️',
    shield: '🛡️',
    star: '⭐',
  };

  let price = addon.basePrice;
  if (addon.hasDuration && selectedPlan) {
    if (selectedPlan.type === '3month') price *= 3;
    if (selectedPlan.type === '6month') price *= 6;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
        selected
          ? 'shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      style={{
        borderColor: selected ? primaryColor : undefined,
        backgroundColor: selected ? `${primaryColor}08` : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{iconMap[addon.icon] || '💊'}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">{name}</span>
            <span className="font-bold text-gray-900">${price}</span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>
        </div>
        <div
          className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition ${
            selected
              ? 'border-transparent bg-current'
              : 'border-gray-300'
          }`}
          style={{
            borderColor: selected ? primaryColor : undefined,
            backgroundColor: selected ? primaryColor : undefined,
          }}
        >
          {selected && (
            <svg
              className="h-3 w-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// PaymentStep
// ============================================================================

function PaymentStep({
  clientSecret,
  paymentIntentId,
  orderTotal,
  subtotal,
  addonsTotal,
  promoDiscount,
  selectedDose,
  selectedPlan,
  selectedAddons,
  addons,
  productName,
  primaryColor,
  language,
  t,
  onBack,
  onSuccess,
}: {
  clientSecret: string;
  paymentIntentId: string | null;
  orderTotal: number;
  subtotal: number;
  addonsTotal: number;
  promoDiscount: number;
  selectedDose: DoseWithPlans | null;
  selectedPlan: DosePlanOption | null;
  selectedAddons: string[];
  addons: AddonConfig[];
  productName: string;
  primaryColor: string;
  language: string;
  t: (key: string) => string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Validation failed');
      setIsProcessing(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/checkout?success=true&pi=${paymentIntentId}`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed');
      setIsProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <div>
      <h1 className="page-title mb-1 text-center">{t('paymentTitle')}</h1>
      <p className="page-subtitle mb-8 text-center">{t('paymentSubtitle')}</p>

      {/* Order summary recap */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('orderSummary')}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <div>
              <span className="text-gray-600">
                {productName}
                {selectedDose ? ` (${selectedDose.strength})` : ''}
              </span>
            </div>
            <span className="font-medium">${selectedPlan?.price}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>
              {language === 'en' ? selectedPlan?.nameEn : selectedPlan?.nameEs}
            </span>
            <span>
              {selectedPlan?.billing === 'monthly'
                ? t('perMonth')
                : selectedPlan?.billing === 'total'
                  ? t('threeMonth')
                  : t('oneTime')}
            </span>
          </div>
          {addons
            .filter((a) => selectedAddons.includes(a.id))
            .map((addon) => {
              let price = addon.basePrice;
              if (addon.hasDuration && selectedPlan) {
                if (selectedPlan.type === '3month') price *= 3;
                if (selectedPlan.type === '6month') price *= 6;
              }
              return (
                <div key={addon.id} className="flex justify-between">
                  <span className="text-gray-600">
                    {language === 'en' ? addon.nameEn : addon.nameEs}
                  </span>
                  <span className="font-medium">+${price}</span>
                </div>
              );
            })}
          <div className="flex justify-between">
            <span className="text-gray-600">{t('shipping')}</span>
            <span className="font-medium text-green-600">
              {t('shippingFree')}
            </span>
          </div>
          {promoDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>{t('discount')}</span>
              <span>-${promoDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-gray-200 pt-2">
            <div className="flex justify-between text-base font-bold">
              <span>{t('total')}</span>
              <span style={{ color: primaryColor }}>
                ${orderTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stripe form */}
      <form onSubmit={handleSubmit}>
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
          <PaymentElement options={{ layout: 'tabs' }} />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-gray-300 px-6 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
          >
            {t('back')}
          </button>
          <button
            type="submit"
            disabled={!stripe || isProcessing}
            className="continue-button flex-1"
          >
            {isProcessing
              ? t('processing')
              : `${t('completePurchase')} — $${orderTotal.toFixed(2)}`}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Page Wrapper (default export)
// ============================================================================

export default function CheckoutPage() {
  return (
    <LanguageProvider>
      <React.Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        }
      >
        <CheckoutInner />
      </React.Suspense>
    </LanguageProvider>
  );
}
