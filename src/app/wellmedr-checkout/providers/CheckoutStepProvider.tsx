'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

type CheckoutStep = 'approval' | 'shipping' | 'payment';

interface CheckoutStepContextValue {
  currentStep: CheckoutStep;
  goToStep: (step: CheckoutStep) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
}

const STEP_ORDER: CheckoutStep[] = ['approval', 'shipping', 'payment'];
const STEP_STORAGE_KEY = 'wellmedr_checkout_step';

// Virtual page paths for GTM tracking
const STEP_PATHS: Record<CheckoutStep, string> = {
  approval: '/checkout/product-selection',
  shipping: '/checkout/shipping',
  payment: '/checkout/payment',
};

function getStoredStep(): CheckoutStep {
  if (typeof window === 'undefined') return 'approval';
  const stored = sessionStorage.getItem(STEP_STORAGE_KEY);
  if (stored && STEP_ORDER.includes(stored as CheckoutStep)) {
    return stored as CheckoutStep;
  }
  return 'approval';
}

const CheckoutStepContext = createContext<CheckoutStepContextValue | null>(null);

export function CheckoutStepProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('approval');

  // Restore step from sessionStorage on mount
  useEffect(() => {
    const storedStep = getStoredStep();
    if (storedStep !== 'approval') {
      setCurrentStep(storedStep);
    }
  }, []);

  // Persist step to sessionStorage when it changes
  useEffect(() => {
    sessionStorage.setItem(STEP_STORAGE_KEY, currentStep);
  }, [currentStep]);

  // Push virtual pageview to GTM when step changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dataLayer = (window as any).dataLayer;
      dataLayer?.push({
        event: 'virtual_page_view',
        page_path: STEP_PATHS[currentStep],
        page_title: `Checkout - ${currentStep}`,
      });
    }
  }, [currentStep]);

  const goToStep = useCallback((step: CheckoutStep) => {
    setCurrentStep(step);
  }, []);

  const goToNextStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      setCurrentStep(STEP_ORDER[currentIndex + 1]);
    }
  }, [currentStep]);

  const goToPreviousStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEP_ORDER[currentIndex - 1]);
    }
  }, [currentStep]);

  return (
    <CheckoutStepContext.Provider value={{ currentStep, goToStep, goToNextStep, goToPreviousStep }}>
      {children}
    </CheckoutStepContext.Provider>
  );
}

export function useCheckoutStep() {
  const context = useContext(CheckoutStepContext);
  if (!context) {
    throw new Error('useCheckoutStep must be used within a CheckoutStepProvider');
  }
  return context;
}

export type { CheckoutStep };
