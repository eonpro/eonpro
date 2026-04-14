'use client';

import { useMemo, useState, useEffect } from 'react';
import { computeTotals } from '../lib/pricing';
import { PillIcon, FlameIcon } from '../icons/icons';
import { StripeProvider } from './StripeProvider';
import { PaymentForm } from './PaymentForm';
import { ThankYouPage } from './ThankYouPage';
import { AddressAutocomplete } from './AddressAutocomplete';
import {
  useIntakePrefill,
  prefillToPatientData,
  prefillToMedication,
  prefillToPlan,
} from '../hooks/useIntakePrefill';
import { clearAllPrefillData } from '../utils/cookies';
import { getOrCreateCheckoutIdentity, updateCheckoutIdentity } from '../lib/checkoutIdentity';

export type ShippingAddress = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
};

type Plan = {
  id: string;
  type: string;
  price: number;
  billing: string;
  savings?: number;
  badge?: string;
};

type Medication = {
  id: 'semaglutide' | 'tirzepatide';
  name: string;
  strength: string;
  description: string;
  efficacy: string;
  isAdvanced?: boolean;
  tag?: string;
  lowestMonthlyPrice?: number;
  plans: Plan[];
};

// Translation dictionary
const translations = {
  en: {
    congratulations: 'Congratulations! You qualify for GLP-1 treatment',
    chooseMedication: 'Choose Your GLP-1 Medication',
    medicationSubtitle: "Select the medication that's right for your weight loss journey",
    selectPlan: 'Select Your Plan & Add-ons',
    planSubtitle: 'Choose your subscription plan and optional enhancements',
    shippingPayment: 'Shipping Information',
    shippingSubtitle: 'Enter your shipping details',
    orderSummary: 'Order Summary',
    subtotal: 'Subtotal',
    shipping: 'Shipping',
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
    expeditedShipping: 'Expedited Shipping',
    medicalConsultation: 'Medical consultation',
    freeShipping: 'Free shipping',
    startingAt: 'Starting at',
    asLowAs: 'As low as',
    mostPopular: 'Most Popular',
    mostEffective: 'Most Effective',
    selected: 'Selected! Continuing to plans...',
    choosePlan: 'Choose Your Plan',
    // Contact info fields
    contactInfo: 'Contact Information',
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email Address',
    phone: 'Phone Number',
    phoneOptional: 'Phone (Optional)',
    requiredField: 'This field is required',
    invalidEmail: 'Please enter a valid email address',
  },
  es: {
    congratulations: '¡Felicitaciones! Califica para el tratamiento GLP-1',
    chooseMedication: 'Elija Su Medicamento GLP-1',
    medicationSubtitle: 'Seleccione el medicamento adecuado para su viaje de pérdida de peso',
    selectPlan: 'Seleccione Su Plan y Complementos',
    planSubtitle: 'Elija su plan de suscripción y mejoras opcionales',
    shippingPayment: 'Información de Envío',
    shippingSubtitle: 'Ingrese sus datos de envío',
    orderSummary: 'Resumen del Pedido',
    subtotal: 'Subtotal',
    shipping: 'Envío',
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
    expeditedShipping: 'Envío Acelerado',
    medicalConsultation: 'Consulta médica',
    freeShipping: 'Envío gratis',
    startingAt: 'Desde',
    asLowAs: 'Desde solo',
    mostPopular: 'Más Popular',
    mostEffective: 'Más Efectivo',
    selected: '¡Seleccionado! Continuando a planes...',
    choosePlan: 'Elija Su Plan',
    // Contact info fields
    contactInfo: 'Información de Contacto',
    firstName: 'Nombre',
    lastName: 'Apellido',
    email: 'Correo Electrónico',
    phone: 'Número de Teléfono',
    phoneOptional: 'Teléfono (Opcional)',
    requiredField: 'Este campo es requerido',
    invalidEmail: 'Por favor ingrese un correo electrónico válido',
  },
};

export function GLP1CheckoutPageImproved() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<'success' | 'cancel' | null>(null);
  const [selectedMedication, setSelectedMedication] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [expeditedShipping, setExpeditedShipping] = useState<boolean>(false);
  const [fatBurnerDuration] = useState<string>('1');
  const [promoCode, setPromoCode] = useState<string>('');
  const [appliedPromoCode, setAppliedPromoCode] = useState<string>('');
  const [promoApplied, setPromoApplied] = useState<boolean>(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  const [showAddressConfirmation, setShowAddressConfirmation] = useState<boolean>(false);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
  });
  const [patientData, setPatientData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    age: 0,
    weight: 0,
    height: '',
    bmi: 0,
    qualified: false,
    medicalHistory: '',
    symptoms: '',
    medication_preference: '',
    state: '',
  });

  // Track if this is a direct checkout (no prefill data) - set once after prefill check
  const [isDirectCheckout, setIsDirectCheckout] = useState<boolean | null>(null);

  // =========================================================================
  // Heyflow Intake Prefill Integration
  // =========================================================================
  const {
    data: prefillData,
    intakeId,
    isLoading: isPrefillLoading,
    clearPrefill: _clearPrefill, // Available for manual clear if needed
  } = useIntakePrefill({ debug: true });

  // Determine if this is a direct checkout (no prefill) after prefill check completes
  useEffect(() => {
    if (!isPrefillLoading && isDirectCheckout === null) {
      const hasPrefillContactInfo = prefillData?.firstName || prefillData?.email;
      setIsDirectCheckout(!hasPrefillContactInfo);
      console.log(
        '[Checkout] Mode:',
        hasPrefillContactInfo ? 'Prefill from Heyflow' : 'Direct checkout'
      );
    }
  }, [isPrefillLoading, prefillData, isDirectCheckout]);

  // =========================================================================
  // Meta CAPI Identity - Capture and persist tracking params on mount
  // =========================================================================
  useEffect(() => {
    const identity = getOrCreateCheckoutIdentity();
    console.log('[Checkout] Meta CAPI identity initialized:', {
      meta_event_id: identity.meta_event_id,
      lead_id: identity.lead_id,
      fbp: identity.fbp ? '***' : undefined,
      fbc: identity.fbc ? '***' : undefined,
    });
  }, []);

  // Apply intake body class for consistent styling
  useEffect(() => {
    document.body.classList.add('intake-body');
    return () => document.body.classList.remove('intake-body');
  }, []);

  // Sync patient data to checkout identity for Meta CAPI tracking
  useEffect(() => {
    if (patientData.email || patientData.phone || patientData.firstName) {
      updateCheckoutIdentity({
        email: patientData.email || undefined,
        phone: patientData.phone || undefined,
        firstName: patientData.firstName || undefined,
        lastName: patientData.lastName || undefined,
      });
    }
  }, [patientData.email, patientData.phone, patientData.firstName, patientData.lastName]);

  // Apply prefill data when available
  useEffect(() => {
    if (prefillData && !isPrefillLoading) {
      console.log('[Checkout] Applying prefill data from intake:', prefillData);

      // Update patient data
      const patientPrefill = prefillToPatientData(prefillData);
      setPatientData((prev) => ({
        ...prev,
        firstName: patientPrefill.firstName || prev.firstName,
        lastName: patientPrefill.lastName || prev.lastName,
        email: patientPrefill.email || prev.email,
        phone: patientPrefill.phone || prev.phone,
      }));

      // Note: Address is not prefilled from Heyflow - user enters on checkout

      // Pre-select medication if provided
      const medication = prefillToMedication(prefillData);
      if (medication) {
        setSelectedMedication(medication);

        // Also set default plan if not provided in prefill data
        const plan = prefillToPlan(prefillData);
        const med = medications.find((m) => m.id === medication);
        if (med && med.plans.length > 0) {
          if (plan) {
            // Find matching plan ID from medications data
            const matchingPlan = med.plans.find((p) => p.type === plan);
            if (matchingPlan) {
              setSelectedPlan(matchingPlan.id);
            } else {
              // Fallback to first plan if specified plan not found
              setSelectedPlan(med.plans[0].id);
            }
          } else {
            // Default to first plan (monthly recurring)
            setSelectedPlan(med.plans[0].id);
          }
        }
      }

      // Set language preference (sanitize: trim and validate)
      if (prefillData.language) {
        const lang = prefillData.language.trim().toLowerCase();
        setLanguage(lang === 'es' ? 'es' : 'en');
      }

      // Log intake ID for tracking
      if (intakeId) {
        console.log('[Checkout] Intake ID for tracking:', intakeId);
      }
    }
  }, [prefillData, isPrefillLoading, intakeId]);
  // =========================================================================

  // Load qualification data from URL parameter on mount
  useEffect(() => {
    // Get query parameter from URL
    const urlParams = new URLSearchParams(window.location.search);
    const encodedData = urlParams.get('q');

    if (encodedData) {
      try {
        // Decode and parse the data
        const qualificationData = JSON.parse(atob(encodedData));
        const data = qualificationData;

        // Parse weight data
        const weightData = data.weight
          ? typeof data.weight === 'string'
            ? JSON.parse(data.weight)
            : data.weight
          : null;
        const dobData = data.dob
          ? typeof data.dob === 'string'
            ? JSON.parse(data.dob)
            : data.dob
          : null;
        const languagePref = data.language;

        // Calculate age from DOB
        let age = 0;
        if (dobData) {
          try {
            const dob = dobData;
            const birthDate = new Date(dob.year, dob.month - 1, dob.day);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              age--;
            }
          } catch (e) {}
        }

        // Parse weight and height
        let weight = 0;
        let height = '';
        let bmi = 0;

        if (weightData) {
          try {
            const parsed = weightData;
            weight = parsed.currentWeight || 0;
            const heightInches = (parsed.heightFeet || 0) * 12 + (parsed.heightInches || 0);
            height = parsed.heightFeet + "'" + parsed.heightInches + '"';

            // Calculate BMI
            if (weight && heightInches) {
              bmi = (weight / (heightInches * heightInches)) * 703;
              bmi = Math.round(bmi * 10) / 10;
            }
          } catch (e) {}
        }

        // Parse address if available
        let address = {};
        if (data.address) {
          try {
            address = typeof data.address === 'string' ? JSON.parse(data.address) : data.address;
          } catch (e) {}
        }

        setPatientData({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          phone: data.phone || '',
          age: age,
          weight: weight,
          height: height,
          bmi: bmi,
          qualified: data.qualified || false,
          medicalHistory: '',
          symptoms: '',
          medication_preference: data.medication_preference || '',
          state: data.state || '',
        });

        // Set language preference (sanitize: trim and validate)
        if (languagePref) {
          const lang = String(languagePref).trim().toLowerCase();
          setLanguage(lang === 'es' ? 'es' : 'en');
        }

        // Parse enhanced data (NEW: Full data from consolidated intake!)
        const chronicConditions = data.chronic_conditions
          ? typeof data.chronic_conditions === 'string'
            ? JSON.parse(data.chronic_conditions)
            : data.chronic_conditions
          : [];
        const digestiveConditions = data.digestive_conditions
          ? typeof data.digestive_conditions === 'string'
            ? JSON.parse(data.digestive_conditions)
            : data.digestive_conditions
          : [];
        const goals = data.goals
          ? typeof data.goals === 'string'
            ? JSON.parse(data.goals)
            : data.goals
          : [];
        const sideEffects = data.side_effects
          ? typeof data.side_effects === 'string'
            ? JSON.parse(data.side_effects)
            : data.side_effects
          : [];
        const glp1History = data.glp1_history || '';
        const activityLevel = data.activity_level || '';
        const medications = data.medications
          ? typeof data.medications === 'string'
            ? JSON.parse(data.medications)
            : data.medications
          : [];
        const allergies = data.allergies
          ? typeof data.allergies === 'string'
            ? JSON.parse(data.allergies)
            : data.allergies
          : [];

        // Calculate weight loss goal
        let weightToLose = 0;
        if (weightData && weightData.currentWeight && weightData.idealWeight) {
          weightToLose = weightData.currentWeight - weightData.idealWeight;
        }

        // Enhanced smart medication recommendation logic
        let recommendedMedication = data.medication_preference;

        // Use recommended medication if provided, otherwise calculate
        if (data.recommended_medication) {
          recommendedMedication = data.recommended_medication;
        } else if (data.medication_preference === 'recommendation' || !data.medication_preference) {
          // Advanced recommendation based on multiple factors
          if (
            (weightToLose >= 50 && glp1History === 'never_taken') ||
            (bmi >= 35 && glp1History === 'never_taken') ||
            goals.includes('lose_50_plus') ||
            chronicConditions.includes('diabetes_type2')
          ) {
            recommendedMedication = 'tirzepatide'; // Better for higher BMI and diabetes
          } else {
            recommendedMedication = 'semaglutide';
          }
        }

        // Set the recommended medication AND default plan
        if (recommendedMedication && recommendedMedication !== 'recommendation') {
          setSelectedMedication(recommendedMedication);
          // Also set default plan (first plan = monthly recurring)
          // Use hardcoded plan IDs since medications array may not be ready
          const defaultPlanId =
            recommendedMedication === 'semaglutide' ? 'sema_monthly' : 'tirz_monthly';
          setSelectedPlan(defaultPlanId);
        }

        // Enhanced smart add-on recommendations using all data
        const autoAddons: string[] = data.recommended_addons
          ? JSON.parse(data.recommended_addons)
          : [];

        // Additional logic for add-ons based on comprehensive data
        if (autoAddons.length === 0) {
          // Check for nausea conditions (expanded criteria)
          if (
            sideEffects.includes('nausea') ||
            sideEffects.includes('vomiting') ||
            digestiveConditions.includes('heartburn') ||
            digestiveConditions.includes('gerd') ||
            digestiveConditions.includes('acid_reflux') ||
            digestiveConditions.includes('ibs') ||
            digestiveConditions.includes('gastroparesis')
          ) {
            autoAddons.push('nausea-rx');
          }

          // Check for energy/fatigue conditions (expanded criteria)
          if (
            sideEffects.includes('fatigue') ||
            activityLevel === 'sedentary' ||
            activityLevel === 'lightly_active' ||
            goals.includes('more_energy') ||
            chronicConditions.includes('sleep_apnea')
          ) {
            autoAddons.push('fat-burner');
          }
        }

        // Set auto-selected add-ons
        if (autoAddons.length > 0) {
          setSelectedAddons(autoAddons);
        }

        // Log comprehensive data received (for debugging)
        console.log('Comprehensive intake data received:', {
          bmi,
          weightToLose,
          chronicConditions,
          digestiveConditions,
          medications,
          allergies,
          glp1History,
          goals,
          activityLevel,
          sideEffects,
          recommendedMedication,
          autoAddons,
        });

        // Pre-populate shipping address if available
        if (address && typeof address === 'object') {
          const addr = address as any;
          const prefilledAddress = {
            addressLine1: addr.street || addr.fullAddress || '',
            addressLine2: addr.unit || '',
            city: addr.city || '',
            state: addr.state || data.state || '',
            zipCode: addr.zipCode || '',
            country: 'US',
          };
          setShippingAddress(prefilledAddress);

          // Mark that we have a pre-filled address to ask for confirmation
          if (addr.street || addr.fullAddress) {
            setShowAddressConfirmation(true);
          }
        }
      } catch (error) {
        console.error('Error loading qualification data:', error);
      }
    }
  }, []);

  // Safeguard: ensure t is never undefined (fallback to English)
  const t = translations[language] || translations.en;

  const medications: Medication[] = [
    {
      id: 'semaglutide',
      name: 'Semaglutide',
      strength: '2.5-5mg',
      description:
        language === 'es'
          ? 'Inyección semanal GLP-1 para control de peso'
          : 'Weekly GLP-1 injection for weight management',
      efficacy: '15-20% weight loss',
      tag: t.mostPopular,
      lowestMonthlyPrice: 169, // 6-month package: $1014 / 6 = $169
      plans: [
        { id: 'sema_monthly', type: t.monthlyRecurring, price: 229, billing: 'monthly' },
        {
          id: 'sema_3month',
          type: t.package3Month,
          price: 567,
          billing: 'total',
          savings: 120,
          badge: t.save + ' $120',
        }, // $189 x 3 months
        {
          id: 'sema_6month',
          type: t.package6Month,
          price: 1014,
          billing: 'total',
          savings: 360,
          badge: t.bestValue,
        }, // $169 x 6 months
        { id: 'sema_onetime', type: t.oneTimePurchase, price: 299, billing: 'once' },
      ],
    },
    {
      id: 'tirzepatide',
      name: 'Tirzepatide',
      strength: '10-20mg',
      description:
        language === 'es'
          ? 'Inyección GLP-1/GIP de doble acción para resultados superiores'
          : 'Dual-action GLP-1/GIP injection for superior results',
      efficacy: '20-25% weight loss',
      isAdvanced: true,
      tag: t.mostEffective,
      lowestMonthlyPrice: 279, // 6-month package: $1674 / 6 = $279
      plans: [
        { id: 'tirz_monthly', type: t.monthlyRecurring, price: 329, billing: 'monthly' },
        {
          id: 'tirz_3month',
          type: t.package3Month,
          price: 891,
          billing: 'total',
          savings: 96,
          badge: t.save + ' $96',
        }, // $297 x 3 months
        {
          id: 'tirz_6month',
          type: t.package6Month,
          price: 1674,
          billing: 'total',
          savings: 300,
          badge: t.bestValue,
        }, // $279 x 6 months
        { id: 'tirz_onetime', type: t.oneTimePurchase, price: 399, billing: 'once' }, // Updated to $399
      ],
    },
  ];

  const addons = useMemo(
    () => [
      {
        id: 'nausea-rx',
        name:
          language === 'es' ? 'Prescripción para Alivio de Náuseas' : 'Nausea Relief Prescription',
        nameEn: 'Nausea Relief Prescription', // English name for metadata
        price: 39,
        basePrice: 39,
        description:
          language === 'es'
            ? 'Medicamento recetado para manejar los efectos secundarios de GLP-1'
            : 'Prescription medication to manage GLP-1 side effects',
        icon: PillIcon,
        hasDuration: true,
        getDynamicPrice: (_duration?: string, selectedPlanData?: { id: string }) => {
          if (selectedPlanData) {
            if (selectedPlanData.id.includes('3month')) return 39 * 3;
            if (selectedPlanData.id.includes('6month')) return 39 * 6;
          }
          return 39;
        },
      },
      {
        id: 'fat-burner',
        name:
          language === 'es'
            ? 'Quemador de Grasa (L-Carnitina + Complejo B)'
            : 'Fat Burner (L-Carnitine + B Complex)',
        nameEn: 'Fat Burner (L-Carnitine + B Complex)', // English name for metadata
        basePrice: 99,
        description:
          language === 'es'
            ? 'Aumenta el metabolismo y la energía durante la pérdida de peso'
            : 'Boost metabolism and energy during weight loss',
        icon: FlameIcon,
        hasDuration: true,
        getDynamicPrice: (duration?: string, selectedPlanData?: { id: string }) => {
          if (duration && duration !== 'auto') return 99 * parseInt(duration, 10);
          if (selectedPlanData) {
            if (selectedPlanData.id.includes('3month')) return 99 * 3;
            if (selectedPlanData.id.includes('6month')) return 99 * 6;
          }
          return 99;
        },
      },
    ],
    [language]
  );

  const selectedMed = medications.find((m) => m.id === selectedMedication);
  const selectedPlanData = selectedMed?.plans.find((p) => p.id === selectedPlan);

  const { subtotal, total, shippingCost, discount } = computeTotals({
    selectedPlanData,
    selectedAddons,
    addons,
    fatBurnerDuration,
    expeditedShipping,
    promoApplied,
  });

  // Check if contact info is complete
  // - Always require: name + email
  // - Direct checkout mode: also require phone
  const isContactInfoComplete = useMemo(() => {
    const hasName = patientData.firstName?.trim() && patientData.lastName?.trim();
    const hasEmail =
      patientData.email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientData.email.trim());

    // For direct checkout (no prefill), also require phone
    if (isDirectCheckout) {
      const hasPhone =
        patientData.phone?.trim() && patientData.phone.replace(/\D/g, '').length >= 10;
      return Boolean(hasName && hasEmail && hasPhone);
    }

    return Boolean(hasName && hasEmail);
  }, [
    patientData.firstName,
    patientData.lastName,
    patientData.email,
    patientData.phone,
    isDirectCheckout,
  ]);

  const isShippingComplete = useMemo(() => {
    const hasAddress = Boolean(
      shippingAddress.addressLine1?.trim() &&
      shippingAddress.city?.trim() &&
      shippingAddress.state?.trim() &&
      shippingAddress.zipCode?.trim()
    );
    // Must have both contact info and shipping address
    return hasAddress && isContactInfoComplete;
  }, [
    shippingAddress.addressLine1,
    shippingAddress.city,
    shippingAddress.state,
    shippingAddress.zipCode,
    isContactInfoComplete,
  ]);

  const allowedPromoCodes = useMemo(() => {
    const raw = (process.env.NEXT_PUBLIC_EONMEDS_PROMO_CODES as string | undefined) || '';
    const codes = raw
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const finalCodes = codes.length > 0 ? codes : ['EON25'];
    return new Set(finalCodes);
  }, []);

  function applyPromo() {
    setPromoError(null);
    const code = promoCode.trim().toUpperCase();
    if (!code) {
      setPromoError(
        language === 'es' ? 'Ingrese un código promocional.' : 'Please enter a promo code.'
      );
      return;
    }
    if (!allowedPromoCodes.has(code)) {
      setPromoError(language === 'es' ? 'Código promocional inválido.' : 'Invalid promo code.');
      return;
    }
    setAppliedPromoCode(code);
    setPromoApplied(true);
    setPromoCode(''); // Clear input after successful apply
  }

  function removePromo() {
    setPromoApplied(false);
    setAppliedPromoCode('');
    setPromoCode('');
    setPromoError(null);
  }

  // Read status from URL
  useMemo(() => {
    try {
      const url = new URL(window.location.href);
      const s = url.searchParams.get('status');
      if (s === 'success' || s === 'cancel') setStatusBanner(s);
    } catch {}
    return undefined;
  }, []);

  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string>('');

  async function handlePaymentSuccess(intentId: string) {
    // Payment successful!
    // Save order to database and show success message
    console.log('Payment successful! Payment Intent:', intentId);
    if (intakeId) {
      console.log('[Checkout] Order completed for intake ID:', intakeId);
    }

    setPaymentIntentId(intentId);
    setPaymentSuccess(true);
    setStatusBanner('success');

    // Clear prefill data after successful payment
    clearAllPrefillData();
    console.log('[Checkout] Prefill data cleared after successful payment');

    // Scroll to top of page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handlePaymentError(error: string) {
    console.error('Payment error:', error);
    alert(`Payment failed: ${error}`);
  }

  function handleNextStep() {
    if (currentStep === 1 && selectedMedication) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => {
          setTimeout(() => setIsTransitioning(false), 100);
        });
      }, 250);
    } else if (currentStep === 2 && selectedPlan) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(3);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => {
          setTimeout(() => setIsTransitioning(false), 100);
        });
      }, 250);
    } else if (currentStep === 3 && isShippingComplete) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(4);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => {
          setTimeout(() => setIsTransitioning(false), 100);
        });
      }, 250);
    }
  }

  function handlePreviousStep() {
    if (currentStep > 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(currentStep - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => {
          setTimeout(() => setIsTransitioning(false), 100);
        });
      }, 250);
    }
  }

  // If payment is successful, show thank you page
  if (paymentSuccess) {
    return (
      <ThankYouPage
        paymentIntentId={paymentIntentId}
        language={language}
        medication={selectedMed?.name}
        plan={selectedPlanData?.type}
        planPrice={selectedPlanData?.price}
        addons={selectedAddons
          .map((id) => addons.find((a) => a.id === id)?.name || '')
          .filter(Boolean)}
        expeditedShipping={expeditedShipping}
        total={total}
        shippingAddress={shippingAddress}
      />
    );
  }

  const progressPercent =
    currentStep === 1 ? 25 : currentStep === 2 ? 50 : currentStep === 3 ? 75 : 100;

  return (
    <div
      className="flex min-h-screen flex-col"
      style={
        {
          '--intake-primary': '#413d3d',
          '--intake-accent': '#f5ecd8',
          '--intake-selected-bg': '#f5ecd8',
          '--intake-bg': '#ffffff',
        } as React.CSSProperties
      }
    >
      {/* Progress Bar */}
      <div className="h-1 w-full bg-gray-100">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%`, backgroundColor: '#f5ecd8' }}
        />
      </div>

      {/* Main Content Column */}
      <div className="flex-1 px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[480px] py-6 lg:max-w-[560px]">
          {/* Back Button */}
          {currentStep > 1 && (
            <button
              onClick={handlePreviousStep}
              className="-ml-2 mb-2 inline-block rounded-lg p-2 transition-colors hover:bg-gray-100"
              aria-label={t.back}
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
          )}

          {/* Logo + Language Toggle */}
          <div className="mb-8 flex items-center justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://static.wixstatic.com/media/c49a9b_88a74e1029934b5e95b8bf5b8b1108d7~mv2.png"
              alt="eonmeds"
              className="h-7 object-contain"
            />
            <div className="relative inline-flex items-center rounded-full border border-gray-200 bg-white p-0.5 shadow-sm">
              <button
                onClick={() => setLanguage('en')}
                className={`relative z-10 rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-300 ${language === 'en' ? 'text-white' : 'text-gray-500'}`}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage('es')}
                className={`relative z-10 rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-300 ${language === 'es' ? 'text-white' : 'text-gray-500'}`}
              >
                ES
              </button>
              <div
                className={`absolute bottom-0.5 top-0.5 rounded-full bg-[#413d3d] transition-all duration-300 ease-out ${language === 'en' ? 'left-0.5 right-[50%]' : 'left-[50%] right-0.5'}`}
              />
            </div>
          </div>

          {/* Status Banner */}
          {statusBanner && (
            <div
              className={`mb-6 rounded-lg p-3 text-center text-sm text-white ${statusBanner === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
            >
              {statusBanner === 'success'
                ? language === 'es'
                  ? 'Pago exitoso. ¡Gracias!'
                  : 'Payment successful. Thank you!'
                : language === 'es'
                  ? 'Pago cancelado. Puedes intentar de nuevo.'
                  : 'Payment canceled. You can try again.'}
            </div>
          )}

          {/* ============ STEP 1: Medication Selection ============ */}
          {currentStep === 1 && (
            <div
              className={`transition-all duration-300 ease-out ${isTransitioning ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
            >
              <div className="mb-8 space-y-2">
                <h1 className="text-[1.875rem] font-[510] leading-[1.1] text-[#413d3d] lg:text-4xl">
                  {patientData.firstName
                    ? `${patientData.firstName}, ${t.chooseMedication}`
                    : t.chooseMedication}
                </h1>
                <p className="text-[15.5px] font-[350] leading-relaxed text-[#413d3d]/70">
                  {t.medicationSubtitle}
                </p>
              </div>

              <div className="space-y-3">
                {medications.map((med) => (
                  <button
                    key={med.id}
                    type="button"
                    onClick={() => {
                      setSelectedMedication(med.id);
                      if (med.plans?.length > 0) setSelectedPlan(med.plans[0].id);
                    }}
                    className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                      selectedMedication === med.id
                        ? 'border-[#cab172] bg-[#f5ecd8]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex w-full items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          med.id === 'semaglutide'
                            ? 'https://static.wixstatic.com/media/c49a9b_7adb19325cea4ad8b15d6845977fc42a~mv2.png'
                            : 'https://static.wixstatic.com/media/c49a9b_00c1ff5076814c8e93e3c53a132b962e~mv2.png'
                        }
                        alt={med.name}
                        className="h-16 w-16 flex-shrink-0 object-contain"
                      />
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#413d3d]">{med.name}</span>
                          {med.tag && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${med.id === 'semaglutide' ? 'bg-[#413d3d]' : 'bg-orange-500'}`}
                            >
                              {med.tag}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-[#413d3d]/70">
                          {med.strength} &middot; {med.description}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#413d3d]">
                          {t.asLowAs} ${med.lowestMonthlyPrice || med.plans[0].price}/
                          {language === 'es' ? 'mes' : 'mo'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ============ STEP 2: Plan & Add-ons ============ */}
          {currentStep === 2 && selectedMed && (
            <div
              className={`transition-all duration-300 ease-out ${isTransitioning ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
            >
              <div className="mb-8 space-y-2">
                <h1 className="text-[1.875rem] font-[510] leading-[1.1] text-[#413d3d] lg:text-4xl">
                  {patientData.firstName
                    ? `${patientData.firstName}, ${t.selectPlan}`
                    : t.selectPlan}
                </h1>
                <p className="text-[15.5px] font-[350] leading-relaxed text-[#413d3d]/70">
                  {t.planSubtitle}
                </p>
              </div>

              {/* Selected Medication Preview */}
              <div className="mb-6 flex items-center gap-3 rounded-2xl bg-[#f5ecd8] p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    selectedMed.id === 'semaglutide'
                      ? 'https://static.wixstatic.com/media/c49a9b_4da809344f204a088d1d4708b4c1609b~mv2.webp'
                      : 'https://static.wixstatic.com/media/c49a9b_00c1ff5076814c8e93e3c53a132b962e~mv2.png'
                  }
                  alt={selectedMed.name}
                  className="h-12 object-contain"
                />
                <div>
                  <p className="text-sm font-semibold text-[#413d3d]">
                    {language === 'es'
                      ? selectedMed.id === 'semaglutide'
                        ? 'Semaglutida Compuesta'
                        : 'Tirzepatida Compuesta'
                      : `Compounded ${selectedMed.name}`}
                  </p>
                  <p className="text-xs text-[#413d3d]/60">{selectedMed.strength}</p>
                </div>
              </div>

              {/* HSA/FSA Badge */}
              <div className="mb-4 flex w-fit items-center gap-1.5 rounded-full bg-[#413d3d] px-3 py-1.5 text-xs font-medium text-white">
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                {language === 'es' ? 'Tarjetas HSA/FSA aceptadas' : 'HSA/FSA cards accepted'}
              </div>

              {/* Plan Selection */}
              <h3 className="mb-3 text-base font-semibold">{t.choosePlan}</h3>
              <div className="mb-8 space-y-3">
                {selectedMed.plans.map((plan) => {
                  const isSelected = selectedPlan === plan.id;
                  const monthlyPrice =
                    plan.billing === 'monthly'
                      ? plan.price
                      : plan.type.includes('3')
                        ? Math.round(plan.price / 3)
                        : plan.type.includes('6')
                          ? Math.round(plan.price / 6)
                          : plan.price;
                  const originalMonthlyPrice = plan.savings
                    ? Math.round(
                        (plan.price + plan.savings) /
                          (plan.type.includes('3') ? 3 : plan.type.includes('6') ? 6 : 1)
                      )
                    : null;

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`relative w-full rounded-2xl border-2 p-4 text-left transition-all ${
                        isSelected
                          ? 'border-[#cab172] bg-[#f5ecd8]'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex w-full items-center gap-3">
                        <div
                          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? 'border-[#cab172] bg-[#cab172]' : 'border-gray-300'}`}
                        >
                          {isSelected && (
                            <svg
                              className="h-3 w-3 text-white"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <span className="text-[15px] font-semibold text-[#413d3d]">
                            {plan.type}
                          </span>
                          {isSelected && plan.billing !== 'once' && (
                            <p className="mt-1 text-xs text-[#413d3d]/60">
                              {plan.billing === 'monthly'
                                ? language === 'es'
                                  ? `$${plan.price}/mes`
                                  : `$${plan.price}/month`
                                : plan.type.includes('3')
                                  ? language === 'es'
                                    ? `$${plan.price} cada 3 meses`
                                    : `$${plan.price} every 3 months`
                                  : language === 'es'
                                    ? `$${plan.price} cada 6 meses`
                                    : `$${plan.price} every 6 months`}
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {originalMonthlyPrice && originalMonthlyPrice !== monthlyPrice && (
                            <span className="mr-1.5 text-xs text-gray-400 line-through">
                              ${originalMonthlyPrice}/mo
                            </span>
                          )}
                          <span className="text-[15px] font-bold text-[#413d3d]">
                            ${monthlyPrice}/mo
                          </span>
                        </div>
                      </div>
                      {plan.savings && plan.savings > 0 && (
                        <span className="absolute -right-2 -top-2 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {language === 'es' ? 'Ahorra' : 'Save'} ${plan.savings}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Add-ons */}
              <h3 className="mb-3 text-base font-semibold">{t.optionalAddons}</h3>
              <div className="space-y-3">
                {addons.map((addon) => {
                  const isSelected = selectedAddons.includes(addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedAddons(selectedAddons.filter((id) => id !== addon.id));
                        } else {
                          setSelectedAddons([...selectedAddons, addon.id]);
                        }
                      }}
                      className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                        isSelected
                          ? 'border-[#cab172] bg-[#f5ecd8]'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex w-full items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            addon.id === 'fat-burner'
                              ? 'https://static.wixstatic.com/media/c49a9b_7cf96a7c6da041d2ae156b2f0436343d~mv2.png'
                              : 'https://static.wixstatic.com/media/c49a9b_6c1b30c9e184401cbc20788d869fccdf~mv2.png'
                          }
                          alt={addon.name}
                          className="h-10 w-10 flex-shrink-0 object-contain"
                        />
                        <div className="flex-1 text-left">
                          <span className="text-sm font-medium text-[#413d3d]">{addon.name}</span>
                          <p className="text-xs text-[#413d3d]/60">{addon.description}</p>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <span className="text-sm font-medium text-[#413d3d]">
                            ${addon.basePrice || addon.price}/{language === 'es' ? 'mes' : 'mo'}
                          </span>
                          <div
                            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${isSelected ? 'bg-white' : 'bg-transparent'}`}
                            style={{ border: '1.5px solid #413d3d' }}
                          >
                            {isSelected && (
                              <svg
                                className="h-3 w-3 text-[#413d3d]"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2.5}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============ STEP 3: Shipping ============ */}
          {currentStep === 3 && (
            <div
              className={`transition-all duration-300 ease-out ${isTransitioning ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
            >
              <div className="mb-8 space-y-2">
                <h1 className="text-[1.875rem] font-[510] leading-[1.1] text-[#413d3d] lg:text-4xl">
                  {patientData.firstName
                    ? `${patientData.firstName}, ${t.shippingPayment}`
                    : t.shippingPayment}
                </h1>
                <p className="text-[15.5px] font-[350] leading-relaxed text-[#413d3d]/70">
                  {t.shippingSubtitle}
                </p>
              </div>

              {/* Contact Info */}
              {isDirectCheckout ? (
                <div className="mb-6">
                  <h3 className="mb-4 text-base font-semibold text-[#413d3d]">{t.contactInfo}</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[#413d3d]">
                          {t.firstName} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={patientData.firstName}
                          onChange={(e) =>
                            setPatientData((prev) => ({ ...prev, firstName: e.target.value }))
                          }
                          className="w-full rounded-2xl border-2 border-black/10 bg-white p-4 text-[17px] font-[530] text-[#333] outline-none transition-all focus:border-[#cab172]"
                          placeholder={language === 'es' ? 'Juan' : 'John'}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[#413d3d]">
                          {t.lastName} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={patientData.lastName}
                          onChange={(e) =>
                            setPatientData((prev) => ({ ...prev, lastName: e.target.value }))
                          }
                          className="w-full rounded-2xl border-2 border-black/10 bg-white p-4 text-[17px] font-[530] text-[#333] outline-none transition-all focus:border-[#cab172]"
                          placeholder={language === 'es' ? 'García' : 'Doe'}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#413d3d]">
                        {t.email} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={patientData.email}
                        onChange={(e) =>
                          setPatientData((prev) => ({ ...prev, email: e.target.value }))
                        }
                        className="w-full rounded-2xl border-2 border-black/10 bg-white p-4 text-[17px] font-[530] text-[#333] outline-none transition-all focus:border-[#cab172]"
                        placeholder={language === 'es' ? 'correo@ejemplo.com' : 'email@example.com'}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#413d3d]">
                        {t.phone} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={patientData.phone}
                        onChange={(e) =>
                          setPatientData((prev) => ({ ...prev, phone: e.target.value }))
                        }
                        className="w-full rounded-2xl border-2 border-black/10 bg-white p-4 text-[17px] font-[530] text-[#333] outline-none transition-all focus:border-[#cab172]"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                </div>
              ) : patientData.firstName ? (
                <div className="mb-6 rounded-2xl bg-gray-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#413d3d]">
                      <span className="text-lg font-semibold text-white">
                        {(patientData.firstName || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-medium text-[#413d3d]">
                        {patientData.firstName} {patientData.lastName}
                      </p>
                      {patientData.email && (
                        <p className="mt-0.5 text-sm text-[#413d3d]/70">{patientData.email}</p>
                      )}
                      {patientData.phone && (
                        <p className="text-sm text-[#413d3d]/70">{patientData.phone}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Shipping Address */}
              <div className="mb-6">
                <h3 className="mb-4 text-base font-semibold">{t.shippingAddress}</h3>

                {showAddressConfirmation && shippingAddress.addressLine1 && (
                  <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="mb-2 text-sm font-medium text-blue-900">
                      {language === 'es'
                        ? '¿Es esta tu dirección de envío?'
                        : 'Is this your shipping address?'}
                    </p>
                    <p className="text-sm text-gray-700">
                      {shippingAddress.addressLine1}
                      {shippingAddress.addressLine2 && `, ${shippingAddress.addressLine2}`}
                      <br />
                      {shippingAddress.city}, {shippingAddress.state} {shippingAddress.zipCode}
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        onClick={() => setShowAddressConfirmation(false)}
                        className="rounded-full bg-[#413d3d] px-4 py-2 text-sm font-medium text-white"
                      >
                        {language === 'es' ? 'Sí, usar esta' : 'Yes, use this'}
                      </button>
                      <button
                        onClick={() => {
                          setShowAddressConfirmation(false);
                          setShippingAddress({
                            addressLine1: '',
                            addressLine2: '',
                            city: '',
                            state: '',
                            zipCode: '',
                            country: 'US',
                          });
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
                      >
                        {language === 'es' ? 'No, cambiar' : 'No, change it'}
                      </button>
                    </div>
                  </div>
                )}

                <AddressAutocomplete
                  value={shippingAddress}
                  onChange={setShippingAddress}
                  language={language}
                />
              </div>

              {/* Delivery Method */}
              <div className="mb-6">
                <h3 className="mb-4 text-base font-semibold">
                  {language === 'es' ? 'Método de Envío' : 'Delivery Method'}
                </h3>
                <div className="space-y-3">
                  <label className="block cursor-pointer">
                    <div
                      className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${!expeditedShipping ? 'border-[#cab172] bg-[#f5ecd8]' : 'border-gray-200'}`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="shipping"
                            checked={!expeditedShipping}
                            onChange={() => setExpeditedShipping(false)}
                            className="h-5 w-5 accent-[#cab172]"
                          />
                          <div>
                            <p className="text-sm font-medium">
                              {language === 'es'
                                ? 'Estándar (5-7 días hábiles)'
                                : 'Standard (5-7 business days)'}
                            </p>
                            <p className="text-xs text-[#413d3d]/60">
                              {language === 'es' ? 'Envío gratuito' : 'Free shipping'}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-medium">
                          {language === 'es' ? 'GRATIS' : 'FREE'}
                        </span>
                      </div>
                    </div>
                  </label>
                  <label className="block cursor-pointer">
                    <div
                      className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${expeditedShipping ? 'border-[#cab172] bg-[#f5ecd8]' : 'border-gray-200'}`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="shipping"
                            checked={expeditedShipping}
                            onChange={() => setExpeditedShipping(true)}
                            className="h-5 w-5 accent-[#cab172]"
                          />
                          <div>
                            <p className="text-sm font-medium">
                              {language === 'es'
                                ? 'Rápido (3-5 días hábiles)'
                                : 'Expedited (3-5 business days)'}
                            </p>
                            <p className="text-xs text-[#413d3d]/60">
                              {language === 'es' ? 'Recíbelo más rápido' : 'Get it faster'}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-medium">$25.00</span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ============ STEP 4: Payment ============ */}
          {currentStep === 4 && (
            <div
              className={`transition-all duration-300 ease-out ${isTransitioning ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
            >
              <div className="mb-8 space-y-2">
                <h1 className="text-[1.875rem] font-[510] leading-[1.1] text-[#413d3d] lg:text-4xl">
                  {patientData.firstName ? `${patientData.firstName}, ${t.payment}` : t.payment}
                </h1>
                <p className="text-[15.5px] font-[350] leading-relaxed text-[#413d3d]/70">
                  {language === 'es'
                    ? 'Complete su compra de forma segura'
                    : 'Securely complete your purchase'}
                </p>
              </div>

              {/* Order Summary (inline) */}
              {selectedMed && selectedPlanData && (
                <div className="mb-6 rounded-2xl bg-[#f5ecd8] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-[#413d3d]">{t.orderSummary}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#413d3d]/70">
                        {selectedMed.name} &middot; {selectedPlanData.type}
                      </span>
                      <span className="font-medium">${selectedPlanData.price}</span>
                    </div>
                    {selectedAddons.map((addonId) => {
                      const addon = addons.find((a) => a.id === addonId);
                      if (!addon) return null;
                      const price = addon.getDynamicPrice
                        ? addon.getDynamicPrice(fatBurnerDuration, selectedPlanData)
                        : addon.price;
                      return (
                        <div key={addonId} className="flex justify-between">
                          <span className="text-[#413d3d]/70">{addon.name}</span>
                          <span>${price}</span>
                        </div>
                      );
                    })}
                    {expeditedShipping && (
                      <div className="flex justify-between">
                        <span className="text-[#413d3d]/70">{t.expeditedShipping}</span>
                        <span>$25</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#413d3d]/70">{t.shipping}</span>
                      <span className={expeditedShipping ? '' : 'font-medium text-green-600'}>
                        {expeditedShipping ? `$${shippingCost}` : 'FREE'}
                      </span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#413d3d]/70">
                          {language === 'es' ? 'Descuento' : 'Discount'}
                        </span>
                        <span className="font-medium text-green-700">-${discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 font-semibold">
                      <span>{t.total}</span>
                      <span>${total.toFixed(2)} USD</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Shipping Summary */}
              <div className="mb-6 rounded-2xl bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#413d3d]">
                      {language === 'es' ? 'Envío' : 'Shipping'}
                    </p>
                    <p className="mt-1 text-sm text-[#413d3d]/80">
                      {shippingAddress.addressLine1}
                      {shippingAddress.addressLine2 ? `, ${shippingAddress.addressLine2}` : ''}
                      <br />
                      {shippingAddress.city}, {shippingAddress.state} {shippingAddress.zipCode}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="text-sm font-medium text-[#cab172] hover:underline"
                  >
                    {language === 'es' ? 'Editar' : 'Edit'}
                  </button>
                </div>
              </div>

              {/* Promo Code */}
              {!promoApplied ? (
                <div className="mb-6 rounded-2xl bg-gray-50 p-4">
                  <p className="mb-3 text-sm font-semibold text-[#413d3d]">
                    {language === 'es' ? '¿Tienes un código promocional?' : 'Have a promo code?'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value.toUpperCase());
                        if (promoError) setPromoError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          applyPromo();
                        }
                      }}
                      placeholder={language === 'es' ? 'Código' : 'Code'}
                      className="flex-1 rounded-2xl border-2 border-black/10 bg-white p-3 text-sm font-[530] uppercase text-[#333] outline-none transition-all focus:border-[#cab172]"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      className="rounded-full bg-[#413d3d] px-4 py-2 text-sm font-medium text-white"
                    >
                      {language === 'es' ? 'Aplicar' : 'Apply'}
                    </button>
                  </div>
                  {promoError && <p className="mt-2 text-xs text-red-600">{promoError}</p>}
                </div>
              ) : (
                <div className="mb-6 flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="text-sm text-green-800">
                    <span className="font-medium">
                      {language === 'es' ? '¡Código aplicado!' : 'Code applied!'}
                    </span>
                    <span className="ml-2 font-semibold">{appliedPromoCode}</span>
                    <span className="ml-2 text-green-600">(-${discount.toFixed(2)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={removePromo}
                    className="text-sm font-medium text-green-800 underline"
                  >
                    {language === 'es' ? 'Quitar' : 'Remove'}
                  </button>
                </div>
              )}

              {/* Payment Form */}
              <div className="mb-6">
                <h3 className="mb-4 text-base font-semibold">{t.payment}</h3>
                <StripeProvider
                  amount={total}
                  customerEmail={patientData.email}
                  customerName={`${patientData.firstName} ${patientData.lastName}`.trim()}
                  customerPhone={patientData.phone}
                  shippingAddress={shippingAddress}
                  language={language}
                  intakeId={intakeId || undefined}
                  orderData={{
                    medication: selectedMed?.name || '',
                    plan: selectedPlanData?.type || '',
                    billing: (selectedPlanData?.billing || 'once') as 'monthly' | 'total' | 'once',
                    addons: selectedAddons
                      .map((id) => {
                        const addon = addons.find((a) => a.id === id);
                        return (addon as any)?.nameEn || addon?.name || '';
                      })
                      .filter(Boolean),
                    expeditedShipping,
                    subtotal,
                    shippingCost,
                    total,
                  }}
                >
                  <PaymentForm
                    amount={total}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                    customerEmail={patientData.email}
                    language={language}
                    shippingAddress={shippingAddress}
                    orderData={{
                      medication: selectedMed?.name || '',
                      plan: selectedPlanData?.type || '',
                      billing: (selectedPlanData?.billing || 'once') as
                        | 'monthly'
                        | 'total'
                        | 'once',
                      addons: selectedAddons
                        .map((id) => {
                          const addon = addons.find((a) => a.id === id);
                          return (addon as any)?.nameEn || addon?.name || '';
                        })
                        .filter(Boolean),
                      expeditedShipping,
                      subtotal,
                      shippingCost,
                      total,
                    }}
                  />
                </StripeProvider>
              </div>

              {/* Terms */}
              <div className="mb-6 rounded-2xl bg-gray-50 p-4">
                <p className="text-xs leading-relaxed text-[#413d3d]/70">
                  <span className="font-medium">
                    {language === 'es'
                      ? "Importante: Al hacer clic en 'Realizar pedido' usted acepta que:"
                      : "Important: By clicking 'Place Order' you agree that:"}
                  </span>
                  <br />
                  <br />
                  {selectedPlanData &&
                  (selectedPlanData.billing === 'monthly' || selectedPlanData.billing === 'total')
                    ? language === 'es'
                      ? `Si se prescribe, está comprando una suscripción que se renueva automáticamente y se le cobrará $${total} por los primeros ${selectedPlanData.type.includes('6') ? '6 meses' : selectedPlanData.type.includes('3') ? '3 meses' : 'mes'}. Puede cancelar su suscripción en cualquier momento a través de su cuenta en línea o contactando a soporte al cliente en support@eonmeds.com o 1-800-368-0038.`
                      : `If prescribed, you are purchasing an automatically-renewing subscription and will be charged $${total} for the first ${selectedPlanData.type.includes('6') ? '6 months' : selectedPlanData.type.includes('3') ? '3 months' : 'month'}. You can cancel your subscription at any time through your online account or by contacting customer support at support@eonmeds.com or 1-800-368-0038.`
                    : language === 'es'
                      ? 'Está realizando una compra única. No se le cobrará de forma recurrente.'
                      : 'You are making a one-time purchase. You will not be charged on a recurring basis.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom CTA */}
      {currentStep < 4 && (
        <div
          className="sticky bottom-0 left-0 right-0 px-6 py-4 pb-6 lg:px-8"
          style={{ background: 'linear-gradient(to top, #ffffff 60%, transparent 100%)' }}
        >
          <div className="mx-auto w-full max-w-[480px] lg:max-w-[560px]">
            <button
              onClick={handleNextStep}
              disabled={
                (currentStep === 1 && !selectedMedication) ||
                (currentStep === 2 && !selectedPlan) ||
                (currentStep === 3 && !isShippingComplete)
              }
              className="flex w-full items-center justify-center gap-3 rounded-full px-8 py-4 text-lg font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: '#413d3d' }}
            >
              <span>
                {currentStep === 1
                  ? t.continuePlan
                  : currentStep === 2
                    ? t.continueShipping
                    : t.continuePayment}
              </span>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <p
              className="mt-4 text-center"
              style={{ fontSize: '12px', color: 'rgba(65, 61, 61, 0.5)', lineHeight: '1.2' }}
            >
              &copy; 2026 EONPro, LLC. All rights reserved.
              <br />
              Exclusive and protected process.
            </p>
          </div>
        </div>
      )}

      {/* Footer on payment step */}
      {currentStep === 4 && (
        <div className="px-6 pb-6">
          <p
            className="text-center"
            style={{ fontSize: '12px', color: 'rgba(65, 61, 61, 0.5)', lineHeight: '1.2' }}
          >
            &copy; 2026 EONPro, LLC. All rights reserved.
            <br />
            Exclusive and protected process.
          </p>
        </div>
      )}
    </div>
  );
}

export default GLP1CheckoutPageImproved;
