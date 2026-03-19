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
    const weight = Number(searchParams.get('weight')) || 190;
    const goalWeight = Number(searchParams.get('goalWeight')) || 150;
    const heightFeet = searchParams.get('heightFeet') || '';
    const heightInches = searchParams.get('heightInches') || '0';

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
      firstName: searchParams.get('firstName') || '',
      lastName: searchParams.get('lastName') || '',
      email: searchParams.get('email') || '',
      state: searchParams.get('state') || '',
      sex: searchParams.get('sex') || '',
      dob: searchParams.get('dob') || undefined,
      bmi,
    };
  }, [searchParams]);

  const uid = searchParams.get('uid') || '';

  return (
    <div className="wellmedr-checkout min-h-screen">
      <Header />
      <CheckoutStepProvider>
        <DynamicCheckoutProgressHeader />
        <main className="relative flex flex-col items-center justify-center w-full min-h-[60svh] sm:min-h-[50svh] px-6 sm:px-8">
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
