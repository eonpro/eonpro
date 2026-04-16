'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { TimerProvider } from './providers/TimerProvider';
import CheckoutFormProvider from './providers/CheckoutFormProvider';
import { CheckoutStepProvider } from './providers/CheckoutStepProvider';
import { ProductsProvider } from './providers/ProductsProvider';
import StepRenderer from './components/StepRenderer';
import DynamicCheckoutProgressHeader from './components/DynamicCheckoutProgressHeader';
import Header from './components/ui/Header';
import type { PatientData } from './types/fillout';
import { PATIENT_DATA_KEY } from './lib/session-keys';
import PaymentLoadingSkeleton from './components/payment/PaymentLoadingSkeleton';
import './wellmedr.css';

function CheckoutContent() {
  const searchParams = useSearchParams();
  const paymentError = searchParams.get('payment_error') === 'true';

  const patientData: PatientData = useMemo(() => {
    // Primary source: sessionStorage (populated by intake redirect, HIPAA-safe)
    let stored: Record<string, string | number> = {};
    if (typeof sessionStorage !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(PATIENT_DATA_KEY);
        if (raw) stored = JSON.parse(raw);
      } catch {
        /* ignore parse errors */
      }
    }

    // Fallback: read from URL params if sessionStorage is empty (e.g. shared link)
    const hasStoredData = Object.keys(stored).length > 0;
    if (!hasStoredData) {
      const fallbackKeys = ['firstName', 'lastName', 'email', 'phone', 'state', 'sex', 'weight', 'goalWeight', 'heightFeet', 'heightInches', 'dob'] as const;
      for (const key of fallbackKeys) {
        const val = searchParams.get(key);
        if (val) stored[key] = val;
      }
      // Persist to sessionStorage so subsequent navigations don't rely on URL
      if (Object.keys(stored).length > 0 && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(PATIENT_DATA_KEY, JSON.stringify(stored));
      }
    }

    const weight = Number(stored.weight) || 190;
    const goalWeight = Number(stored.goalWeight) || 150;
    const heightFeet = String(stored.heightFeet || '');
    const heightInches = String(stored.heightInches || '0');

    let bmi = 0;
    if (heightFeet && weight) {
      const totalInches = parseInt(heightFeet) * 12 + parseInt(heightInches);
      if (totalInches > 0) {
        bmi = parseFloat(((weight / (totalInches * totalInches)) * 703).toFixed(1));
      }
    }

    return {
      weight,
      goalWeight,
      firstName: String(stored.firstName || ''),
      lastName: String(stored.lastName || ''),
      email: String(stored.email || ''),
      phone: String(stored.phone || ''),
      state: String(stored.state || ''),
      sex: String(stored.sex || ''),
      dateOfBirth: String(stored.dob || ''),
      bmi,
    };
  }, [searchParams]);

  const uid = searchParams.get('uid') || '';

  return (
    <div className="wellmedr-checkout min-h-screen">
      <Header />
      <CheckoutStepProvider>
        <DynamicCheckoutProgressHeader />
        {paymentError && (
          <div className="mx-auto max-w-2xl px-4 pt-4" role="alert">
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
              Your payment could not be processed. Please try again or use a different payment method.
            </div>
          </div>
        )}
        <main className="relative flex min-h-[60svh] w-full flex-col items-center justify-center px-6 sm:min-h-[50svh] sm:px-8">
          <TimerProvider>
            <ProductsProvider>
              <CheckoutFormProvider patientData={patientData}>
                <StepRenderer uid={uid} patientData={patientData} />
              </CheckoutFormProvider>
            </ProductsProvider>
          </TimerProvider>
        </main>
      </CheckoutStepProvider>
    </div>
  );
}

export default function WellmedrCheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f7f7f9]">
        <Header />
        <div className="mx-auto max-w-xl px-4 pt-12">
          <PaymentLoadingSkeleton />
        </div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
