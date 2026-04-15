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
import './wellmedr.css';

function CheckoutContent() {
  const searchParams = useSearchParams();

  const patientData: PatientData = useMemo(() => {
    // Read PII from sessionStorage (never from URL params — HIPAA compliance)
    let stored: Record<string, string | number> = {};
    if (typeof sessionStorage !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('wellmedr_patient_data');
        if (raw) stored = JSON.parse(raw);
      } catch {
        /* ignore parse errors */
      }
    }

    const weight = Number(stored.weight) || 190;
    const goalWeight = Number(stored.goalWeight) || 150;
    const heightFeet = String(stored.heightFeet || '');
    const heightInches = String(stored.heightInches || '0');

    let bmi: number | undefined;
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
      dob: stored.dob ? String(stored.dob) : undefined,
      bmi,
    };
  }, []);

  const uid = searchParams.get('uid') || '';

  return (
    <div className="wellmedr-checkout min-h-screen">
      <Header />
      <CheckoutStepProvider>
        <DynamicCheckoutProgressHeader />
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
    <Suspense fallback={<div className="min-h-screen bg-[#f7f7f9]" />}>
      <CheckoutContent />
    </Suspense>
  );
}
