'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { LanguageProvider, useLanguage } from '@/domains/intake/contexts/LanguageContext';
import semaglutideConfig from '@/domains/intake/config/products/semaglutide';
import tirzepatideConfig from '@/domains/intake/config/products/tirzepatide';
import type {
  ProductConfig,
  DoseWithPlans,
  DosePlanOption,
  PlanOption,
  AddonConfig,
} from '@/domains/intake/config/products/types';
import {
  ExitIntentPopup,
  SocialProofToast,
  TrustBadges,
  StickyOrderBar,
  CountdownTimer,
  ResumeModal,
  ReferralCodeCard,
  SmsOptIn,
  lookupZipCode,
  saveCheckoutState,
  loadCheckoutState,
  clearCheckoutState,
  type CheckoutAutoSaveData,
} from './conversion-widgets';

// ============================================================================
// Types
// ============================================================================

type ShippingAddress = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
};

type PatientData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

// ============================================================================
// Translations
// ============================================================================

const translations = {
  en: {
    congratulations: 'Congratulations! You qualify for treatment',
    selectDose: 'Select Your Dose',
    doseSubtitle: "Choose the dosage that's right for you",
    selectPlan: 'Select Your Plan',
    planSubtitle: 'Choose your subscription plan',
    shippingPayment: 'Shipping Information',
    shippingSubtitle: 'Enter your shipping details',
    orderSummary: 'Order Summary',
    subtotal: 'Subtotal',
    shipping: 'Shipping',
    shippingFree: 'FREE',
    total: 'Total',
    continuePlan: 'Continue to Plan Selection',
    continueShipping: 'Continue to Shipping',
    continuePayment: 'Continue to Payment',
    completePurchase: 'Complete Purchase',
    back: 'Back',
    monthlyRecurring: 'Monthly Recurring',
    package3Month: '3 Month Package',
    package6Month: '6 Month Package',
    oneTimePurchase: 'One Time Purchase',
    save: 'Save',
    bestValue: 'Best Value',
    optionalAddons: 'Optional Add-ons',
    shippingAddress: 'Shipping Address',
    payment: 'Payment',
    paymentSubtitle: 'Complete your purchase securely',
    expeditedShipping: 'Expedited Shipping (+$25)',
    medicalConsultation: 'Medical consultation included',
    freeShipping: 'Free standard shipping',
    promoCode: 'Promo code',
    applyPromo: 'Apply',
    promoApplied: 'Promo applied!',
    promoInvalid: 'Invalid code',
    starterDose: 'Starter Dose',
    higherDose: 'Higher Dose',
    recommendedNew: 'Recommended for new patients',
    forContinuing: 'For continuing patients',
    recommended: 'Recommended',
    startingAt: 'Starting at',
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email',
    phone: 'Phone',
    address: 'Street Address',
    address2: 'Apt / Suite (optional)',
    city: 'City',
    state: 'State',
    zip: 'ZIP Code',
    processing: 'Processing...',
    thankYou: 'Thank You!',
    orderConfirmed: 'Your order has been confirmed',
    orderDetails: 'Order Details',
    medication: 'Medication',
    dose: 'Dose',
    plan: 'Plan',
    addons: 'Add-ons',
    confirmationEmail: 'A confirmation email will be sent to',
    perMonth: '/mo',
    oneTime: 'one-time',
    threeMonth: '3-month package',
    discount: 'Discount',
    whatsNext: "What's Next",
    whatsNextStep1: 'A licensed provider will review your information within 24 hours',
    whatsNextStep2: 'Once approved, your medication will be shipped to you',
    whatsNextStep3: 'You will receive tracking information via email',
    monthlyBilling: '/month recurring',
    totalBilling: ' one payment',
    onceBilling: ' one-time',
    smsOptIn: 'Text me order updates & health tips',
    smartDefaultBanner: 'Based on your intake, we pre-selected the best options for you',
  },
  es: {
    congratulations: '¡Felicitaciones! Califica para el tratamiento',
    selectDose: 'Seleccione Su Dosis',
    doseSubtitle: 'Elija la dosis adecuada para usted',
    selectPlan: 'Seleccione Su Plan',
    planSubtitle: 'Elija su plan de suscripción',
    shippingPayment: 'Información de Envío',
    shippingSubtitle: 'Ingrese sus datos de envío',
    orderSummary: 'Resumen del Pedido',
    subtotal: 'Subtotal',
    shipping: 'Envío',
    shippingFree: 'GRATIS',
    total: 'Total',
    continuePlan: 'Continuar a Selección de Plan',
    continueShipping: 'Continuar a Envío',
    continuePayment: 'Continuar a Pago',
    completePurchase: 'Completar Compra',
    back: 'Atrás',
    monthlyRecurring: 'Mensual Recurrente',
    package3Month: 'Paquete de 3 Meses',
    package6Month: 'Paquete de 6 Meses',
    oneTimePurchase: 'Compra Única',
    save: 'Ahorra',
    bestValue: 'Mejor Valor',
    optionalAddons: 'Complementos Opcionales',
    shippingAddress: 'Dirección de Envío',
    payment: 'Pago',
    paymentSubtitle: 'Completa tu compra de forma segura',
    expeditedShipping: 'Envío Acelerado (+$25)',
    medicalConsultation: 'Consulta médica incluida',
    freeShipping: 'Envío estándar gratis',
    promoCode: 'Código promocional',
    applyPromo: 'Aplicar',
    promoApplied: '¡Código aplicado!',
    promoInvalid: 'Código inválido',
    starterDose: 'Dosis Inicial',
    higherDose: 'Dosis Mayor',
    recommendedNew: 'Recomendado para nuevos pacientes',
    forContinuing: 'Para pacientes continuando',
    recommended: 'Recomendado',
    startingAt: 'Desde',
    firstName: 'Nombre',
    lastName: 'Apellido',
    email: 'Correo Electrónico',
    phone: 'Teléfono',
    address: 'Dirección',
    address2: 'Apto / Suite (opcional)',
    city: 'Ciudad',
    state: 'Estado',
    zip: 'Código Postal',
    processing: 'Procesando...',
    thankYou: '¡Gracias!',
    orderConfirmed: 'Tu pedido ha sido confirmado',
    orderDetails: 'Detalles del Pedido',
    medication: 'Medicamento',
    dose: 'Dosis',
    plan: 'Plan',
    addons: 'Complementos',
    confirmationEmail: 'Se enviará un correo de confirmación a',
    perMonth: '/mes',
    oneTime: 'pago único',
    threeMonth: 'paquete de 3 meses',
    discount: 'Descuento',
    whatsNext: 'Próximos Pasos',
    whatsNextStep1: 'Un proveedor con licencia revisará su información dentro de 24 horas',
    whatsNextStep2: 'Una vez aprobado, su medicamento le será enviado',
    whatsNextStep3: 'Recibirá información de seguimiento por correo electrónico',
    monthlyBilling: '/mes recurrente',
    totalBilling: ' pago único',
    onceBilling: ' compra única',
    smsOptIn: 'Envíame actualizaciones por mensaje de texto',
    smartDefaultBanner: 'Según tu evaluación, preseleccionamos las mejores opciones para ti',
  },
};

// ============================================================================
// Stripe
// ============================================================================

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_EONMEDS_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    '',
);

// ============================================================================
// Inline SVG Icon Components
// ============================================================================

function CheckIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PillIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  );
}

function FlameIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
    </svg>
  );
}

const iconMap: Record<string, typeof PillIcon> = {
  pill: PillIcon,
  flame: FlameIcon,
};

// ============================================================================
// Flag SVGs for Language Toggle
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
// Prefill Helpers
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
// CheckoutInner — Main Component (Steps 1-3 + Thank You)
// ============================================================================

export function CheckoutInner() {
  const { language } = useLanguage();
  const t = translations[language];
  const searchParams = useSearchParams();

  const medication = searchParams.get('medication') || 'semaglutide';
  const productConfig: ProductConfig =
    medication === 'tirzepatide' ? tirzepatideConfig : semaglutideConfig;

  const primaryColor = productConfig.branding.primaryColor;
  const doses = productConfig.dosesWithPlans || [];
  const hasDoseBasedPricing = doses.length > 0;

  // Step state
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Dose & plan selection
  const [selectedDose, setSelectedDose] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [expeditedShipping, setExpeditedShipping] = useState<boolean>(false);

  // Promo
  const [promoCode, setPromoCode] = useState<string>('');
  const [promoApplied, setPromoApplied] = useState<boolean>(false);
  const [promoInvalid, setPromoInvalid] = useState<boolean>(false);

  // Patient data
  const [patientData, setPatientData] = useState<PatientData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  // Shipping address
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
  });

  // Payment state
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState<boolean>(false);

  // Conversion optimization state
  const [smsOptIn, setSmsOptIn] = useState(true);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [smartDefaultApplied, setSmartDefaultApplied] = useState(false);
  const savedStateRef = useRef<CheckoutAutoSaveData | null>(null);
  const zipLookupRef = useRef<string>('');

  // Body class for intake styles
  useEffect(() => {
    document.body.classList.add('intake-body');
    return () => document.body.classList.remove('intake-body');
  }, []);

  // Prefill from URL params + sessionStorage, set default dose/plan
  useEffect(() => {
    setPatientData({
      firstName:
        searchParams.get('firstName') || getSessionValue('intake_firstName') || '',
      lastName:
        searchParams.get('lastName') || getSessionValue('intake_lastName') || '',
      email:
        searchParams.get('email') || getSessionValue('intake_email') || '',
      phone:
        searchParams.get('phone') || getSessionValue('intake_phone') || '',
    });

    const addrLine1 =
      searchParams.get('address') || getSessionValue('intake_address') || '';
    const addrCity =
      searchParams.get('city') || getSessionValue('intake_city') || '';
    const addrState =
      searchParams.get('state') || getSessionValue('intake_state') || '';
    const addrZip =
      searchParams.get('zip') || getSessionValue('intake_zip') || '';

    if (addrLine1 || addrCity || addrState || addrZip) {
      setShippingAddress((prev) => ({
        ...prev,
        addressLine1: addrLine1 || prev.addressLine1,
        city: addrCity || prev.city,
        state: addrState || prev.state,
        zipCode: addrZip || prev.zipCode,
      }));
    }

    // Smart defaults from GLP-1 intake answers
    const glp1History = getSessionValue('intake_glp1_history');
    const glp1Type = getSessionValue('intake_glp1_type');
    const semaDosage = getSessionValue('intake_semaglutide_dosage');
    const tirzDosage = getSessionValue('intake_tirzepatide_dosage');

    if (hasDoseBasedPricing && doses.length > 0) {
      let smartDoseId = productConfig.defaultDoseId || doses[0].id;

      if (medication === 'semaglutide') {
        const isExperienced = glp1Type === 'semaglutide' &&
          (glp1History === 'currently_taking' || glp1History === 'previously_taken');
        const highDosages = ['1mg', '1.7mg', '2mg', '2.4mg'];
        if (isExperienced && semaDosage && highDosages.includes(semaDosage)) {
          const higherDose = doses.find((d) => !d.isStarterDose);
          if (higherDose) smartDoseId = higherDose.id;
        }
      }

      setSelectedDose(smartDoseId);
      setSmartDefaultApplied(glp1Type === medication || (!!glp1History && glp1History !== 'never_taken' && glp1History !== 'considering'));

      const doseData = doses.find((d) => d.id === smartDoseId);
      if (doseData && doseData.plans.length > 0) {
        const defaultPlanId = productConfig.defaultPlanId || doseData.plans[0].id;
        const planExists = doseData.plans.some((p) => p.id === defaultPlanId);
        setSelectedPlan(planExists ? defaultPlanId : doseData.plans[0].id);
      }
    } else if (productConfig.defaultPlanId) {
      setSelectedPlan(productConfig.defaultPlanId);
    }

    // Check for auto-saved state to offer resume
    const saved = loadCheckoutState();
    if (saved && saved.medication === medication && saved.currentStep > 1) {
      savedStateRef.current = saved;
      setShowResumeModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, medication]);

  // Auto-save checkout state on changes (non-PHI selections only)
  useEffect(() => {
    if (paymentComplete) return;
    saveCheckoutState({
      medication,
      selectedDose,
      selectedPlan,
      selectedAddons,
      expeditedShipping,
      promoCode,
      promoApplied,
      currentStep,
    });
  }, [medication, selectedDose, selectedPlan, selectedAddons, expeditedShipping, promoCode, promoApplied, currentStep, paymentComplete]);

  // ZIP code auto-fill for city/state
  const handleZipChange = useCallback(async (zip: string) => {
    setShippingAddress((prev) => ({ ...prev, zipCode: zip }));
    if (zip.length === 5 && zip !== zipLookupRef.current) {
      zipLookupRef.current = zip;
      const result = await lookupZipCode(zip);
      if (result) {
        setShippingAddress((prev) => ({
          ...prev,
          city: result.city,
          state: result.state,
        }));
      }
    }
  }, []);

  // Resume handler
  const handleResume = useCallback(() => {
    const saved = savedStateRef.current;
    if (saved) {
      setSelectedDose(saved.selectedDose);
      setSelectedPlan(saved.selectedPlan);
      setSelectedAddons(saved.selectedAddons);
      setExpeditedShipping(saved.expeditedShipping);
      if (saved.promoCode) setPromoCode(saved.promoCode);
      if (saved.promoApplied) setPromoApplied(true);
      setCurrentStep(saved.currentStep);
    }
    setShowResumeModal(false);
  }, []);

  const handleStartFresh = useCallback(() => {
    clearCheckoutState();
    setShowResumeModal(false);
  }, []);

  // Derived: selected dose object
  const selectedDoseData = useMemo(() => {
    if (!hasDoseBasedPricing) return null;
    return doses.find((d) => d.id === selectedDose) || null;
  }, [hasDoseBasedPricing, doses, selectedDose]);

  // Derived: available plans based on dose
  const availablePlans = useMemo(() => {
    if (hasDoseBasedPricing && selectedDoseData) {
      return selectedDoseData.plans;
    }
    return productConfig.plans || [];
  }, [hasDoseBasedPricing, selectedDoseData, productConfig]);

  // When dose changes, try to keep matching plan type or reset
  useEffect(() => {
    if (hasDoseBasedPricing && selectedDoseData && selectedDoseData.plans.length > 0) {
      const currentPlanExists = selectedDoseData.plans.some((p) => p.id === selectedPlan);
      if (!currentPlanExists) {
        const currentPlanData = availablePlans.find((p) => p.id === selectedPlan);
        const matchingPlan = currentPlanData
          ? selectedDoseData.plans.find((p) => p.type === currentPlanData.type)
          : null;
        setSelectedPlan(matchingPlan?.id || selectedDoseData.plans[0].id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDose, selectedDoseData, hasDoseBasedPricing]);

  // Derived: selected plan object
  const selectedPlanData = useMemo(() => {
    return availablePlans.find((p) => p.id === selectedPlan) || null;
  }, [availablePlans, selectedPlan]);

  // Calculate totals
  const totals = useMemo(() => {
    const planPrice = selectedPlanData?.price ?? 0;

    const addonTotal = selectedAddons.reduce((sum, addonId) => {
      const addon = productConfig.addons.find((a) => a.id === addonId);
      if (!addon) return sum;
      let addonPrice = addon.basePrice;
      if (addon.hasDuration && selectedPlanData) {
        if (selectedPlanData.type === '3month') addonPrice *= 3;
        if (selectedPlanData.type === '6month') addonPrice *= 6;
      }
      return sum + addonPrice;
    }, 0);

    const shippingCost = expeditedShipping ? 25 : 0;
    const subtotal = planPrice + addonTotal;
    const discount = promoApplied ? 25 : 0;
    const total = Math.max(0, subtotal + shippingCost - discount);

    return { planPrice, addonTotal, shippingCost, subtotal, discount, total };
  }, [selectedPlanData, selectedAddons, productConfig, expeditedShipping, promoApplied]);

  // Promo code validation
  const handleApplyPromo = () => {
    const allowed = new Set(['EON25', 'SAVE25', 'WELCOME']);
    if (allowed.has(promoCode.toUpperCase())) {
      setPromoApplied(true);
      setPromoInvalid(false);
    } else {
      setPromoInvalid(true);
    }
  };

  const handlePromoExpire = useCallback(() => {
    setPromoApplied(false);
    setPromoCode('');
  }, []);

  // Addon toggle
  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  // Navigation
  const handleContinue = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  // Step validation
  const canProceedStep1 = selectedPlan && (!hasDoseBasedPricing || selectedDose);
  const canProceedStep2 =
    patientData.firstName.trim() &&
    patientData.lastName.trim() &&
    patientData.email.trim() &&
    patientData.phone.trim() &&
    shippingAddress.addressLine1.trim() &&
    shippingAddress.city.trim() &&
    shippingAddress.state.trim() &&
    shippingAddress.zipCode.trim();

  // Create payment intent and advance to step 3
  const handleContinueToPayment = async () => {
    if (!canProceedStep2 || !selectedPlanData) return;
    setIsCreatingIntent(true);
    setPaymentError(null);

    try {
      const res = await fetch('/api/checkout/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totals.total * 100,
          currency: 'usd',
          customer_email: patientData.email,
          customer_name: `${patientData.firstName} ${patientData.lastName}`,
          customer_phone: patientData.phone,
          shipping_address: shippingAddress,
          order_data: {
            medication: productConfig.name,
            dose: selectedDoseData?.strength,
            plan: language === 'en' ? selectedPlanData.nameEn : selectedPlanData.nameEs,
            billing: selectedPlanData.billing,
            addons: productConfig.addons
              .filter((a) => selectedAddons.includes(a.id))
              .map((a) => a.nameEn),
            expeditedShipping,
            subtotal: totals.subtotal,
            shippingCost: totals.shippingCost,
            discount: totals.discount,
            total: totals.total,
          },
          metadata: { product_id: productConfig.id, sms_opt_in: smsOptIn ? 'yes' : 'no' },
          language,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Payment setup failed');

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setCurrentStep(3);
    } catch (err: unknown) {
      setPaymentError(
        err instanceof Error ? err.message : 'Failed to initialize payment',
      );
    } finally {
      setIsCreatingIntent(false);
    }
  };

  // ========================================================================
  // Thank You Page (Inline)
  // ========================================================================
  if (paymentComplete) {
    return (
      <div className="mx-auto max-w-lg px-8 sm:px-4 py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-10 w-10 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="page-title mb-2">{t.thankYou}</h1>
        <p className="page-subtitle mb-8">{t.orderConfirmed}</p>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">{t.orderDetails}</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t.medication}</span>
              <span className="font-medium text-gray-900">{productConfig.name}</span>
            </div>
            {selectedDoseData && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t.dose}</span>
                <span className="font-medium text-gray-900">{selectedDoseData.strength}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">{t.plan}</span>
              <span className="font-medium text-gray-900">
                {language === 'en' ? selectedPlanData?.nameEn : selectedPlanData?.nameEs}
              </span>
            </div>
            {selectedAddons.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t.addons}</span>
                <span className="font-medium text-gray-900">
                  {productConfig.addons
                    .filter((a) => selectedAddons.includes(a.id))
                    .map((a) => (language === 'en' ? a.nameEn : a.nameEs))
                    .join(', ')}
                </span>
              </div>
            )}
            {expeditedShipping && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t.shipping}</span>
                <span className="font-medium text-gray-900">$25.00</span>
              </div>
            )}
            {totals.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t.discount}</span>
                <span>-${totals.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex justify-between text-base font-semibold">
                <span>{t.total}</span>
                <span className="text-green-600">${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">{t.whatsNext}</h3>
          <div className="space-y-4">
            {[t.whatsNextStep1, t.whatsNextStep2, t.whatsNextStep3].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {i + 1}
                </div>
                <p className="pt-0.5 text-sm text-gray-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-6 text-left">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                {language === 'en' ? 'Your patient account has been created' : 'Tu cuenta de paciente ha sido creada'}
              </h3>
              <p className="text-sm text-gray-500">
                {language === 'en' ? 'Access your portal to track orders, chat with your provider, and manage your treatment.' : 'Accede a tu portal para rastrear pedidos, chatear con tu proveedor y manejar tu tratamiento.'}
              </p>
            </div>
          </div>
          <a
            href="https://eonmeds.eonpro.io/patient-portal"
            className="continue-button mt-3 inline-flex w-full"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)` }}
          >
            <span>{language === 'en' ? 'Go to Patient Portal' : 'Ir al Portal del Paciente'}</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        <ReferralCodeCard language={language as 'en' | 'es'} primaryColor={primaryColor} />

        <p className="mt-6 text-sm text-gray-500">
          {t.confirmationEmail} <strong>{patientData.email}</strong>
        </p>

        <p className="copyright-text text-center mt-6">
          © 2026 EONPro, LLC. All rights reserved.<br/>
          Exclusive and protected process.
        </p>
      </div>
    );
  }

  // ========================================================================
  // Checkout Flow
  // ========================================================================
  return (
    <div className="mx-auto max-w-2xl px-8 sm:px-4 py-8 pb-24 sm:pb-8">
      <ExitIntentPopup language={language as 'en' | 'es'} primaryColor={primaryColor} onStay={() => {}} />
      <SocialProofToast language={language as 'en' | 'es'} />
      {showResumeModal && (
        <ResumeModal
          language={language as 'en' | 'es'}
          primaryColor={primaryColor}
          onResume={handleResume}
          onStartFresh={handleStartFresh}
        />
      )}
      <StickyOrderBar
        total={totals.total}
        primaryColor={primaryColor}
        ctaLabel={currentStep === 1 ? t.continueShipping : currentStep === 2 ? t.continuePayment : t.completePurchase}
        onClick={currentStep === 1 ? () => setCurrentStep(2) : currentStep === 2 ? handleContinueToPayment : () => {}}
        disabled={currentStep === 1 ? !canProceedStep1 : currentStep === 2 ? (!canProceedStep2 || isCreatingIntent) : false}
        visible={currentStep <= 2}
      />
      <LanguageToggle />

      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center gap-3">
          {[1, 2, 3].map((step) => (
            <React.Fragment key={step}>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  step <= currentStep ? 'text-white' : 'bg-gray-200 text-gray-500'
                }`}
                style={{
                  backgroundColor: step <= currentStep ? primaryColor : undefined,
                }}
              >
                {step < currentStep ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  step
                )}
              </div>
              {step < 3 && (
                <div
                  className="h-1 w-12 rounded-full transition-colors"
                  style={{
                    backgroundColor: step < currentStep ? primaryColor : '#e5e7eb',
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* STEP 1 — Dose & Plan Selection                                   */}
      {/* ================================================================ */}
      {currentStep === 1 && (
        <div>
          {/* Smart default banner */}
          {smartDefaultApplied && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              {t.smartDefaultBanner}
            </div>
          )}

          {/* Congratulations Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-7 w-7 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="page-title mb-1">{t.congratulations}</h1>
            <p className="page-subtitle">{productConfig.name}</p>
          </div>

          {/* Product Info Bar */}
          <div className="mb-6 rounded-xl bg-gray-50 p-4">
            <h3 className="font-semibold text-gray-900">{productConfig.name}</h3>
            <p className="text-sm text-gray-600">
              {language === 'es' ? productConfig.taglineEs : productConfig.taglineEn}
            </p>
            {productConfig.efficacy && (
              <p className="mt-1 text-sm font-medium" style={{ color: primaryColor }}>
                {language === 'es' ? productConfig.efficacyEs : productConfig.efficacy}
              </p>
            )}
          </div>

          {/* Dose Selection */}
          {hasDoseBasedPricing && (
            <div className="mb-8">
              <h2 className="mb-1 text-lg font-bold text-gray-900">{t.selectDose}</h2>
              <p className="mb-4 text-sm text-gray-500">{t.doseSubtitle}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {doses.map((dose) => (
                  <DoseCard
                    key={dose.id}
                    dose={dose}
                    isSelected={selectedDose === dose.id}
                    onSelect={() => setSelectedDose(dose.id)}
                    language={language}
                    primaryColor={primaryColor}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Plan Selection */}
          {(selectedDose || !hasDoseBasedPricing) && availablePlans.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-1 text-lg font-bold text-gray-900">{t.selectPlan}</h2>
              <p className="mb-4 text-sm text-gray-500">{t.planSubtitle}</p>
              <div className="space-y-3">
                {availablePlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    isSelected={selectedPlan === plan.id}
                    onSelect={() => setSelectedPlan(plan.id)}
                    language={language}
                    primaryColor={primaryColor}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add-ons */}
          {productConfig.features?.enableAddons && productConfig.addons.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-bold text-gray-900">{t.optionalAddons}</h2>
              <div className="space-y-3">
                {productConfig.addons.map((addon) => (
                  <AddonCard
                    key={addon.id}
                    addon={addon}
                    isSelected={selectedAddons.includes(addon.id)}
                    onToggle={() => toggleAddon(addon.id)}
                    language={language}
                    selectedPlan={selectedPlanData || undefined}
                    primaryColor={primaryColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Promo Code */}
          {productConfig.features?.enablePromoCode && (
            <div className="mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    setPromoInvalid(false);
                  }}
                  placeholder={t.promoCode}
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
                  {promoApplied ? t.promoApplied : t.applyPromo}
                </button>
              </div>
              {promoInvalid && (
                <p className="mt-1 text-sm text-red-500">{t.promoInvalid}</p>
              )}
              <CountdownTimer
                language={language as 'en' | 'es'}
                durationMinutes={15}
                onExpire={handlePromoExpire}
                active={promoApplied}
              />
            </div>
          )}

          {/* Order Summary */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t.orderSummary}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t.subtotal}</span>
                <span className="font-medium text-gray-900">${totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.addonTotal > 0 && (
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{t.optionalAddons}</span>
                  <span>+${totals.addonTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">{t.shipping}</span>
                <span className="font-medium text-green-600">
                  {expeditedShipping ? '$25.00' : t.shippingFree}
                </span>
              </div>
              {promoApplied && (
                <div className="flex justify-between text-green-600">
                  <span>{t.discount}</span>
                  <span>-${totals.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2">
                <div className="flex justify-between text-base font-bold">
                  <span>{t.total}</span>
                  <span style={{ color: primaryColor }}>${totals.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Included Benefits */}
          <div className="mb-6 space-y-2 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-green-500" />
              <span>{t.medicalConsultation}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-green-500" />
              <span>{t.freeShipping}</span>
            </div>
          </div>

          {/* Continue Button */}
          <button
            type="button"
            disabled={!canProceedStep1}
            onClick={() => setCurrentStep(2)}
            className="continue-button"
          >
            {t.continueShipping}
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 2 — Shipping Information                                    */}
      {/* ================================================================ */}
      {currentStep === 2 && (
        <div>
          <h1 className="page-title mb-1 text-center">{t.shippingPayment}</h1>
          <p className="page-subtitle mb-8 text-center">{t.shippingSubtitle}</p>

          <div className="space-y-4">
            {/* Name Row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t.firstName}
                </label>
                <input
                  type="text"
                  value={patientData.firstName}
                  onChange={(e) =>
                    setPatientData({ ...patientData, firstName: e.target.value })
                  }
                  className="input-field"
                  placeholder={t.firstName}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t.lastName}
                </label>
                <input
                  type="text"
                  value={patientData.lastName}
                  onChange={(e) =>
                    setPatientData({ ...patientData, lastName: e.target.value })
                  }
                  className="input-field"
                  placeholder={t.lastName}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t.email}
              </label>
              <input
                type="email"
                value={patientData.email}
                onChange={(e) =>
                  setPatientData({ ...patientData, email: e.target.value })
                }
                className="input-field"
                placeholder={t.email}
              />
            </div>

            {/* Phone */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t.phone}
              </label>
              <input
                type="tel"
                value={patientData.phone}
                onChange={(e) =>
                  setPatientData({ ...patientData, phone: e.target.value })
                }
                className="input-field"
                placeholder="(555) 123-4567"
              />
            </div>

            {/* Street Address */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t.address}
              </label>
              <input
                type="text"
                value={shippingAddress.addressLine1}
                onChange={(e) =>
                  setShippingAddress({ ...shippingAddress, addressLine1: e.target.value })
                }
                className="input-field"
                placeholder={t.address}
              />
            </div>

            {/* Apt / Suite */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t.address2}
              </label>
              <input
                type="text"
                value={shippingAddress.addressLine2 || ''}
                onChange={(e) =>
                  setShippingAddress({ ...shippingAddress, addressLine2: e.target.value })
                }
                className="input-field"
                placeholder={t.address2}
              />
            </div>

            {/* City / State / Zip */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t.city}
                </label>
                <input
                  type="text"
                  value={shippingAddress.city}
                  onChange={(e) =>
                    setShippingAddress({ ...shippingAddress, city: e.target.value })
                  }
                  className="input-field"
                  placeholder={t.city}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t.state}
                </label>
                <input
                  type="text"
                  value={shippingAddress.state}
                  onChange={(e) =>
                    setShippingAddress({ ...shippingAddress, state: e.target.value })
                  }
                  className="input-field"
                  placeholder={t.state}
                  maxLength={2}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t.zip}
                </label>
                <input
                  type="text"
                  value={shippingAddress.zipCode}
                  onChange={(e) => handleZipChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  className="input-field"
                  placeholder="12345"
                  maxLength={5}
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Expedited Shipping */}
            {productConfig.features?.enableExpeditedShipping && (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-4 transition hover:border-gray-300">
                <input
                  type="checkbox"
                  checked={expeditedShipping}
                  onChange={(e) => setExpeditedShipping(e.target.checked)}
                  className="h-5 w-5 rounded"
                />
                <span className="text-sm text-gray-700">{t.expeditedShipping}</span>
              </label>
            )}

            {/* SMS Opt-In */}
            <SmsOptIn
              language={language as 'en' | 'es'}
              checked={smsOptIn}
              onChange={setSmsOptIn}
              primaryColor={primaryColor}
            />
          </div>

          {paymentError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {paymentError}
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-xl border border-gray-300 px-6 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {t.back}
            </button>
            <button
              type="button"
              disabled={!canProceedStep2 || isCreatingIntent}
              onClick={handleContinueToPayment}
              className="continue-button flex-1"
            >
              {isCreatingIntent ? t.processing : t.continuePayment}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 3 — Payment                                                 */}
      {/* ================================================================ */}
      {currentStep === 3 && clientSecret && (
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
            orderTotal={totals.total}
            subtotal={totals.subtotal}
            addonTotal={totals.addonTotal}
            promoDiscount={totals.discount}
            shippingCost={totals.shippingCost}
            selectedDose={selectedDoseData}
            selectedPlan={selectedPlanData}
            selectedAddons={selectedAddons}
            addons={productConfig.addons}
            productName={productConfig.name}
            primaryColor={primaryColor}
            language={language}
            t={t}
            onBack={() => setCurrentStep(2)}
            onSuccess={() => {
              setPaymentComplete(true);
              clearCheckoutState();
              try { const { track } = require('@vercel/analytics'); track('intake_payment_completed', { medication: productConfig.name, total: totals.total }); } catch {}
            }}
          />
        </Elements>
      )}
    </div>
  );
}

// ============================================================================
// DoseCard — Side-by-side dose selection with strength, badge, starting price
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
  t: typeof translations.en;
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
      {/* Recommended badge */}
      {dose.isStarterDose && (
        <span
          className="absolute -top-2.5 right-4 rounded-full px-3 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {t.recommended}
        </span>
      )}

      {/* Dose strength — prominent */}
      <div
        className="mb-1 text-2xl font-bold"
        style={{ color: isSelected ? primaryColor : undefined }}
      >
        {dose.strength}
      </div>

      {/* Dose label */}
      <div className="font-semibold text-gray-900">
        {dose.isStarterDose ? t.starterDose : t.higherDose}
      </div>

      {/* Description */}
      <p className="mb-3 mt-2 text-sm text-gray-500">{dose.description}</p>

      {/* Starting price */}
      <div className="text-sm">
        <span className="text-gray-400">{t.startingAt} </span>
        <span className="text-lg font-bold text-gray-900">${startingPrice}</span>
        <span className="text-gray-400">/{language === 'es' ? 'mes' : 'mo'}</span>
      </div>

      {/* Selection indicator — green circle with white checkmark */}
      {isSelected && (
        <div
          className="absolute left-4 top-4 flex h-5 w-5 items-center justify-center rounded-full"
          style={{ backgroundColor: primaryColor }}
        >
          <CheckIcon className="h-3 w-3 text-white" />
        </div>
      )}
    </button>
  );
}

// ============================================================================
// PlanCard — Horizontal row: plan name left, price right, badge, savings
// ============================================================================

function PlanCard({
  plan,
  isSelected,
  onSelect,
  language,
  primaryColor,
  t,
}: {
  plan: PlanOption | DosePlanOption;
  isSelected: boolean;
  onSelect: () => void;
  language: string;
  primaryColor: string;
  t: typeof translations.en;
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
      {/* Badge (top-right) */}
      {badge && (
        <span
          className="absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {badge}
        </span>
      )}

      {/* Plan name (left) + Price (right) */}
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
            {plan.billing === 'total' && (language === 'es' ? ' pago único' : ' one payment')}
            {plan.billing === 'once' && (language === 'es' ? ' compra única' : ' one-time')}
          </span>
        </div>
      </div>

      {/* Savings text in green */}
      {plan.savings && plan.savings > 0 && (
        <p className="mt-1 text-sm font-medium" style={{ color: primaryColor }}>
          {t.save} ${plan.savings}
        </p>
      )}

      {/* Selection indicator — green circle with white checkmark */}
      {isSelected && (
        <div className="absolute right-3 top-3">
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full"
            style={{ backgroundColor: primaryColor }}
          >
            <CheckIcon className="h-3 w-3 text-white" />
          </div>
        </div>
      )}
    </button>
  );
}

// ============================================================================
// AddonCard — Toggle-able add-on with icon, name, description, price
// ============================================================================

function AddonCard({
  addon,
  isSelected,
  onToggle,
  language,
  selectedPlan,
  primaryColor,
}: {
  addon: AddonConfig;
  isSelected: boolean;
  onToggle: () => void;
  language: string;
  selectedPlan?: PlanOption | DosePlanOption;
  primaryColor: string;
}) {
  const name = language === 'es' ? addon.nameEs : addon.nameEn;
  const description = language === 'es' ? addon.descriptionEs : addon.descriptionEn;
  const IconComponent = iconMap[addon.icon] || PillIcon;

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
        isSelected
          ? 'shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      style={{
        borderColor: isSelected ? primaryColor : undefined,
        backgroundColor: isSelected ? `${primaryColor}08` : undefined,
      }}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${primaryColor}20` }}
        >
          <IconComponent className="h-5 w-5" style={{ color: primaryColor }} />
        </div>

        {/* Name + Description */}
        <div className="flex-1">
          <div className="font-semibold text-gray-900">{name}</div>
          <div className="mt-0.5 text-sm text-gray-500">{description}</div>
        </div>

        {/* Price + Checkbox */}
        <div className="flex flex-col items-end gap-1">
          <span className="font-bold text-gray-900">${price}</span>
          <div
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition ${
              isSelected ? 'border-transparent' : 'border-gray-300'
            }`}
            style={{
              borderColor: isSelected ? primaryColor : undefined,
              backgroundColor: isSelected ? primaryColor : undefined,
            }}
          >
            {isSelected && <CheckIcon className="h-3 w-3 text-white" />}
          </div>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// PaymentStep — Stripe Elements + PaymentElement + Order Summary
// ============================================================================

function PaymentStep({
  clientSecret,
  paymentIntentId,
  orderTotal,
  subtotal,
  addonTotal,
  promoDiscount,
  shippingCost,
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
  addonTotal: number;
  promoDiscount: number;
  shippingCost: number;
  selectedDose: DoseWithPlans | null;
  selectedPlan: (PlanOption | DosePlanOption) | null;
  selectedAddons: string[];
  addons: AddonConfig[];
  productName: string;
  primaryColor: string;
  language: string;
  t: typeof translations.en;
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
      <h1 className="page-title mb-1 text-center">{t.payment}</h1>
      <p className="page-subtitle mb-8 text-center">{t.paymentSubtitle}</p>

      {/* Order Summary Recap */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t.orderSummary}
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
            <span>{language === 'en' ? selectedPlan?.nameEn : selectedPlan?.nameEs}</span>
            <span>
              {selectedPlan?.billing === 'monthly' && t.perMonth}
              {selectedPlan?.billing === 'total' && t.threeMonth}
              {selectedPlan?.billing === 'once' && t.oneTime}
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
            <span className="text-gray-600">{t.shipping}</span>
            <span className="font-medium text-green-600">
              {shippingCost > 0 ? `$${shippingCost.toFixed(2)}` : t.shippingFree}
            </span>
          </div>
          {promoDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>{t.discount}</span>
              <span>-${promoDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-gray-200 pt-2">
            <div className="flex justify-between text-base font-bold">
              <span>{t.total}</span>
              <span style={{ color: primaryColor }}>${orderTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stripe Payment Form */}
      <form onSubmit={handleSubmit}>
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
          <PaymentElement options={{ layout: 'tabs' }} />
        </div>

        {/* Trust Badges */}
        <TrustBadges language={language as 'en' | 'es'} />

        {error && (
          <div className="mt-6 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-gray-300 px-6 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
          >
            {t.back}
          </button>
          <button
            type="submit"
            disabled={!stripe || isProcessing}
            className="continue-button flex-1"
          >
            {isProcessing
              ? t.processing
              : `${t.completePurchase} — $${orderTotal.toFixed(2)}`}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// CheckoutPage — Default Export Wrapper
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
