'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { LanguageProvider, useLanguage } from '@/domains/intake/contexts/LanguageContext';
import semaglutideConfig from '@/domains/intake/config/products/semaglutide';
import type { DoseWithPlans, DosePlanOption, AddonConfig } from '@/domains/intake/config/products/types';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_EONMEDS_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    '',
);

const config = semaglutideConfig;

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

const T: Record<string, { en: string; es: string }> = {
  step1Title: { en: 'Choose Your Plan', es: 'Elige Tu Plan' },
  step1Subtitle: { en: 'Select your dose and subscription plan', es: 'Selecciona tu dosis y plan de suscripción' },
  step2Title: { en: 'Shipping Information', es: 'Información de Envío' },
  step2Subtitle: { en: 'Where should we ship your medication?', es: '¿A dónde enviamos tu medicamento?' },
  step3Title: { en: 'Payment', es: 'Pago' },
  step3Subtitle: { en: 'Complete your purchase securely', es: 'Completa tu compra de forma segura' },
  selectDose: { en: 'Select Your Dose', es: 'Selecciona Tu Dosis' },
  selectPlan: { en: 'Select Your Plan', es: 'Selecciona Tu Plan' },
  addons: { en: 'Add-ons', es: 'Complementos' },
  continue: { en: 'Continue', es: 'Continuar' },
  back: { en: 'Back', es: 'Atrás' },
  firstName: { en: 'First Name', es: 'Nombre' },
  lastName: { en: 'Last Name', es: 'Apellido' },
  email: { en: 'Email', es: 'Correo Electrónico' },
  phone: { en: 'Phone', es: 'Teléfono' },
  address: { en: 'Street Address', es: 'Dirección' },
  address2: { en: 'Apt / Suite (optional)', es: 'Apto / Suite (opcional)' },
  city: { en: 'City', es: 'Ciudad' },
  state: { en: 'State', es: 'Estado' },
  zip: { en: 'ZIP Code', es: 'Código Postal' },
  orderSummary: { en: 'Order Summary', es: 'Resumen del Pedido' },
  medication: { en: 'Medication', es: 'Medicamento' },
  dose: { en: 'Dose', es: 'Dosis' },
  plan: { en: 'Plan', es: 'Plan' },
  total: { en: 'Total', es: 'Total' },
  payNow: { en: 'Pay Now', es: 'Pagar Ahora' },
  processing: { en: 'Processing...', es: 'Procesando...' },
  thankYou: { en: 'Thank You!', es: '¡Gracias!' },
  orderConfirmed: { en: 'Your order has been confirmed', es: 'Tu pedido ha sido confirmado' },
  orderDetails: { en: 'Order Details', es: 'Detalles del Pedido' },
  perMonth: { en: '/mo', es: '/mes' },
  oneTime: { en: 'one-time', es: 'pago único' },
  threeMonth: { en: '3-month package', es: 'paquete de 3 meses' },
  recommended: { en: 'Recommended for new patients', es: 'Recomendado para nuevos pacientes' },
  starterDose: { en: 'Starter Dose', es: 'Dosis Inicial' },
  higherDose: { en: 'Higher Dose', es: 'Dosis Superior' },
  step: { en: 'Step', es: 'Paso' },
  of: { en: 'of', es: 'de' },
  confirmationEmail: { en: 'A confirmation email will be sent to', es: 'Se enviará un correo de confirmación a' },
};

function CheckoutInner() {
  const { language } = useLanguage();
  const t = useCallback((key: string) => T[key]?.[language] || T[key]?.en || key, [language]);
  const searchParams = useSearchParams();

  const [step, setStep] = useState(1);
  const [selectedDose, setSelectedDose] = useState<DoseWithPlans | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<DosePlanOption | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);

  useEffect(() => {
    document.body.classList.add('intake-body');
    return () => document.body.classList.remove('intake-body');
  }, []);

  useEffect(() => {
    setFirstName(searchParams.get('firstName') || '');
    setLastName(searchParams.get('lastName') || '');
    setEmail(searchParams.get('email') || '');
    setPhone(searchParams.get('phone') || '');

    const medParam = searchParams.get('medication');
    const planParam = searchParams.get('plan');

    const doses = config.dosesWithPlans || [];
    const defaultDose = doses.find((d) => d.id === config.defaultDoseId) || doses[0];
    if (defaultDose) {
      setSelectedDose(defaultDose);
      const defaultPlan =
        defaultDose.plans.find((p) => p.id === config.defaultPlanId) || defaultDose.plans[0];
      if (defaultPlan) setSelectedPlan(defaultPlan);
    }

    if (medParam && planParam) {
      const matchDose = doses.find(
        (d) => d.name.toLowerCase().includes(medParam.toLowerCase()) || d.id.includes(medParam.toLowerCase()),
      );
      if (matchDose) {
        setSelectedDose(matchDose);
        const matchPlan = matchDose.plans.find(
          (p) => p.id.includes(planParam.toLowerCase()) || p.type === planParam.toLowerCase(),
        );
        if (matchPlan) setSelectedPlan(matchPlan);
      }
    }
  }, [searchParams]);

  const doses = config.dosesWithPlans || [];

  const addonsTotal = useMemo(() => {
    return config.addons
      .filter((a) => selectedAddons.includes(a.id))
      .reduce((sum, a) => sum + a.basePrice, 0);
  }, [selectedAddons]);

  const orderTotal = useMemo(() => {
    return (selectedPlan?.price || 0) + addonsTotal;
  }, [selectedPlan, addonsTotal]);

  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  };

  const canProceedStep1 = selectedDose && selectedPlan;
  const canProceedStep2 =
    firstName.trim() && lastName.trim() && email.trim() && phone.trim() &&
    address1.trim() && city.trim() && state.trim() && zip.trim();

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
            plan: language === 'en' ? selectedPlan.nameEn : selectedPlan.nameEs,
            addons: config.addons.filter((a) => selectedAddons.includes(a.id)).map((a) => a.nameEn),
            subtotal: orderTotal,
            total: orderTotal,
          },
          metadata: { product_id: config.id },
          language,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Payment setup failed');

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setStep(3);
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Failed to initialize payment');
    } finally {
      setIsCreatingIntent(false);
    }
  };

  if (paymentSucceeded) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="page-title mb-2">{t('thankYou')}</h1>
        <p className="page-subtitle mb-8">{t('orderConfirmed')}</p>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">{t('orderDetails')}</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('medication')}</span>
              <span className="font-medium text-gray-900">{config.name}</span>
            </div>
            {selectedDose && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t('dose')}</span>
                <span className="font-medium text-gray-900">{selectedDose.strength}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">{t('plan')}</span>
              <span className="font-medium text-gray-900">
                {language === 'en' ? selectedPlan?.nameEn : selectedPlan?.nameEs}
              </span>
            </div>
            {selectedAddons.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t('addons')}</span>
                <span className="font-medium text-gray-900">
                  {config.addons
                    .filter((a) => selectedAddons.includes(a.id))
                    .map((a) => (language === 'en' ? a.nameEn : a.nameEs))
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
        <p className="mt-6 text-sm text-gray-500">
          {t('confirmationEmail')} <strong>{email}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <LanguageToggle />

      <div className="mb-8 text-center">
        <p className="mb-2 text-sm font-medium text-gray-400">
          {t('step')} {step} {t('of')} 3
        </p>
        <div className="mx-auto flex max-w-xs gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-emerald-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div>
          <h1 className="page-title mb-1 text-center">{t('step1Title')}</h1>
          <p className="page-subtitle mb-8 text-center">{t('step1Subtitle')}</p>

          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t('selectDose')}
          </h3>
          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {doses.map((dose) => (
              <button
                key={dose.id}
                type="button"
                onClick={() => {
                  setSelectedDose(dose);
                  const firstPlan = dose.plans[0];
                  if (firstPlan) setSelectedPlan(firstPlan);
                }}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  selectedDose?.id === dose.id
                    ? 'border-emerald-500 bg-emerald-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">{dose.strength}</span>
                  {dose.isStarterDose && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {t('recommended')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {language === 'en'
                    ? (dose.isStarterDose ? t('starterDose') : t('higherDose'))
                    : (dose.isStarterDose ? t('starterDose') : t('higherDose'))}
                </p>
                <p className="mt-1 text-xs text-gray-400">{dose.description}</p>
              </button>
            ))}
          </div>

          {selectedDose && (
            <>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('selectPlan')}
              </h3>
              <div className="mb-8 space-y-3">
                {selectedDose.plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`w-full rounded-xl border-2 p-4 text-left transition ${
                      selectedPlan?.id === plan.id
                        ? 'border-emerald-500 bg-emerald-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-gray-900">
                          {language === 'en' ? plan.nameEn : plan.nameEs}
                        </span>
                        {plan.badge && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            {language === 'en' ? plan.badge : plan.badgeEs || plan.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-bold text-gray-900">${plan.price}</span>
                        <span className="text-sm text-gray-500">
                          {plan.billing === 'monthly'
                            ? t('perMonth')
                            : plan.billing === 'total'
                              ? ` ${t('threeMonth')}`
                              : ` ${t('oneTime')}`}
                        </span>
                      </div>
                    </div>
                    {plan.savings && (
                      <p className="mt-1 text-sm font-medium text-emerald-600">
                        {language === 'en' ? `Save $${plan.savings}` : `Ahorra $${plan.savings}`}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {config.features?.enableAddons && config.addons.length > 0 && (
            <>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('addons')}
              </h3>
              <div className="mb-8 space-y-3">
                {config.addons.map((addon) => (
                  <AddonCard
                    key={addon.id}
                    addon={addon}
                    selected={selectedAddons.includes(addon.id)}
                    onToggle={() => toggleAddon(addon.id)}
                    language={language}
                  />
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            disabled={!canProceedStep1}
            onClick={() => setStep(2)}
            className="continue-button"
          >
            {t('continue')}
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1 className="page-title mb-1 text-center">{t('step2Title')}</h1>
          <p className="page-subtitle mb-8 text-center">{t('step2Subtitle')}</p>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('firstName')}</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input-field"
                  placeholder={t('firstName')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('lastName')}</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input-field"
                  placeholder={t('lastName')}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder={t('email')}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('phone')}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('address')}</label>
              <input
                type="text"
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                className="input-field"
                placeholder={t('address')}
                id="checkout-address-autocomplete"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('address2')}</label>
              <input
                type="text"
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                className="input-field"
                placeholder={t('address2')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('city')}</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="input-field"
                  placeholder={t('city')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('state')}</label>
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
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('zip')}</label>
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
              {isCreatingIntent ? t('processing') : t('continue')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: '#10B981',
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
            selectedDose={selectedDose}
            selectedPlan={selectedPlan}
            selectedAddons={selectedAddons}
            addons={config.addons}
            productName={config.name}
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

function AddonCard({
  addon,
  selected,
  onToggle,
  language,
}: {
  addon: AddonConfig;
  selected: boolean;
  onToggle: () => void;
  language: string;
}) {
  const iconMap: Record<string, string> = {
    pill: '💊',
    flame: '🔥',
    heart: '❤️',
    shield: '🛡️',
    star: '⭐',
  };
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-xl border-2 p-4 text-left transition ${
        selected
          ? 'border-emerald-500 bg-emerald-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{iconMap[addon.icon] || '💊'}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">
              {language === 'en' ? addon.nameEn : addon.nameEs}
            </span>
            <span className="font-bold text-gray-900">+${addon.basePrice}</span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {language === 'en' ? addon.descriptionEn : addon.descriptionEs}
          </p>
        </div>
        <div
          className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition ${
            selected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
          }`}
        >
          {selected && (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

function PaymentStep({
  clientSecret,
  paymentIntentId,
  orderTotal,
  selectedDose,
  selectedPlan,
  selectedAddons,
  addons,
  productName,
  language,
  t,
  onBack,
  onSuccess,
}: {
  clientSecret: string;
  paymentIntentId: string | null;
  orderTotal: number;
  selectedDose: DoseWithPlans | null;
  selectedPlan: DosePlanOption | null;
  selectedAddons: string[];
  addons: AddonConfig[];
  productName: string;
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
      <h1 className="page-title mb-1 text-center">{t('step3Title')}</h1>
      <p className="page-subtitle mb-8 text-center">{t('step3Subtitle')}</p>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('orderSummary')}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{productName} ({selectedDose?.strength})</span>
            <span className="font-medium">${selectedPlan?.price}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{language === 'en' ? selectedPlan?.nameEn : selectedPlan?.nameEs}</span>
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
            .map((addon) => (
              <div key={addon.id} className="flex justify-between">
                <span className="text-gray-600">
                  {language === 'en' ? addon.nameEn : addon.nameEs}
                </span>
                <span className="font-medium">+${addon.basePrice}</span>
              </div>
            ))}
          <div className="border-t border-gray-200 pt-2">
            <div className="flex justify-between text-base font-bold">
              <span>{t('total')}</span>
              <span className="text-emerald-600">${orderTotal}</span>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
          <PaymentElement
            options={{
              layout: 'tabs',
            }}
          />
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
            {isProcessing ? t('processing') : `${t('payNow')} — $${orderTotal}`}
          </button>
        </div>
      </form>
    </div>
  );
}

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
