'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const UPSELL_PRODUCTS = {
  b12: {
    productId: process.env.NEXT_PUBLIC_WELLMEDR_UPSELL_B12_PRODUCT_ID || '',
    name: 'B12 Injection',
    price: '$69/mo',
    priceCents: 6900,
    daily: '$2.30/day',
    headline: 'Most Patients Add This — Prevent Fatigue',
    description: 'Boost your energy, sharpen mental clarity, and eliminate brain fog.',
    bullets: ['Boosts Metabolism', 'Eliminates Brain Fog', 'Improves Energy'],
  },
  nad: {
    productId: process.env.NEXT_PUBLIC_WELLMEDR_UPSELL_NAD_PRODUCT_ID || '',
    name: 'NAD+ Injection',
    price: '$99/mo',
    priceCents: 9900,
    daily: '$3.30/day',
    headline: 'Add NAD+ to Your Treatment',
    description:
      'Recharge your body at the cellular level with NAD+. Especially effective alongside GLP-1 treatments.',
    bullets: ['Boosts Energy & Focus', 'Supports Metabolism', 'Prevents GLP-1 Fatigue'],
  },
  sermorelin: {
    productId: process.env.NEXT_PUBLIC_WELLMEDR_UPSELL_SERMORELIN_PRODUCT_ID || '',
    name: 'Sermorelin Injection',
    price: '$99/mo',
    priceCents: 9900,
    daily: '$3.30/day',
    headline: 'Preserve Muscle While Losing Weight',
    description:
      'Stimulate natural growth hormone production to enhance fat loss and preserve lean muscle.',
    bullets: ['Enhances Fat Loss', 'Preserves Muscle', 'Improves Recovery'],
  },
} as const;

type ProductKey = keyof typeof UPSELL_PRODUCTS;

const STEPS: { type: 'bundle' | 'single'; key: string; discounted: boolean }[] = [
  { type: 'bundle', key: 'bundle', discounted: false },
  { type: 'single', key: 'b12', discounted: false },
  { type: 'single', key: 'nad', discounted: false },
  { type: 'single', key: 'sermorelin', discounted: false },
  { type: 'bundle', key: 'bundleDiscounted', discounted: true },
];

interface UpsellModalProps {
  customerId: string;
  subscriptionId: string;
  paymentMethod?: { brand: string; last4: string };
  onClose: () => void;
}

export default function UpsellModal({
  customerId,
  subscriptionId,
  paymentMethod,
  onClose,
}: UpsellModalProps) {
  const storageKey = `upsell_step_${subscriptionId}`;

  const [currentStep, setCurrentStep] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const saved = localStorage.getItem(storageKey);
    if (saved === 'done') return -1;
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentStep === -1) onClose();
  }, [currentStep, onClose]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDecline();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentStep]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = prevOverflow;
    };
  }, [handleEscape]);

  const brandDisplay = (brand: string) => {
    const brands: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'Amex',
      discover: 'Discover',
    };
    return brands[brand] || brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  const handleAdd = async () => {
    const step = STEPS[currentStep];
    if (!step) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const isBundle = step.type === 'bundle';
      const allProductIds = Object.values(UPSELL_PRODUCTS).map((p) => p.productId);
      const upsellProductIds = isBundle
        ? allProductIds
        : [UPSELL_PRODUCTS[step.key as ProductKey]?.productId].filter(Boolean);

      const body: Record<string, unknown> = { customerId, upsellProductIds };
      if (step.discounted) {
        body.discountAmountOff = 2000;
      }

      const response = await fetch('/api/wellmedr/add-upsell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.error || 'Something went wrong. Please try again.');
        setIsSubmitting(false);
        return;
      }

      localStorage.setItem(`upsell_completed_${subscriptionId}`, 'true');
      localStorage.setItem(storageKey, 'done');
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setIsSubmitting(false);
        onClose();
      }, 2000);
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleDecline = () => {
    const nextStep = currentStep + 1;
    if (nextStep >= STEPS.length) {
      localStorage.setItem(storageKey, 'done');
      onClose();
    } else {
      localStorage.setItem(storageKey, String(nextStep));
      setCurrentStep(nextStep);
      setError(null);
    }
  };

  if (success) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upsell added"
        className="fixed inset-0 z-50 flex items-center justify-center bg-white"
      >
        <div className="w-full max-w-md px-6 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-10 w-10 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="mb-3 text-2xl font-bold" style={{ color: '#0c2631' }}>
            Added to Your Plan!
          </h2>
          <p className="text-base text-gray-600">
            Your supplements have been added and will ship with your next order.
          </p>
        </div>
      </div>
    );
  }

  if (currentStep < 0 || currentStep >= STEPS.length) return null;

  const step = STEPS[currentStep];
  const isBundle = step.type === 'bundle';

  if (isBundle) {
    const price = step.discounted ? '$179' : '$199';
    return (
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={step.discounted ? 'Final bundle offer' : 'Bundle offer'}
        className="fixed inset-0 z-50 flex flex-col bg-white"
      >
        <div className="flex-shrink-0 py-4 text-center">
          <span className="inline-block rounded-full bg-green-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
            One-Time Offer
          </span>
          <h2 className="mt-2 text-xl font-bold" style={{ color: '#0c2631' }}>
            {step.discounted ? 'Final Offer — Last Chance' : 'Most Patients Add This'}
          </h2>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border-2 border-green-600 shadow-lg">
            <div className="bg-green-600 px-4 py-2 text-center text-sm font-bold uppercase tracking-wider text-white">
              Elite+ Bundle — All 3 Supplements {!step.discounted && '· Save $68/mo'}
            </div>
            <div className="p-5">
              <p className="mb-2 text-lg font-bold" style={{ color: '#0c2631' }}>
                B12 + NAD+ + Sermorelin
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg text-gray-400 line-through">$267</span>
                {step.discounted && (
                  <span className="text-lg text-gray-400 line-through">$199</span>
                )}
                <span className="text-4xl font-bold text-green-600">{price}</span>
                <span className="text-gray-500">/mo</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-gray-100 pb-[env(safe-area-inset-bottom)] pt-4">
          <div className="mx-auto max-w-md px-6">
            {paymentMethod && (
              <div className="mb-2 flex items-center justify-center gap-2 text-sm text-gray-500">
                <span>
                  Charging {brandDisplay(paymentMethod.brand)} ending in {paymentMethod.last4}
                </span>
              </div>
            )}
            {error && <p className="mb-2 text-center text-sm text-red-500">{error}</p>}
            <button
              onClick={handleAdd}
              disabled={isSubmitting}
              className="w-full rounded-xl bg-green-600 py-4 font-bold text-white shadow-lg transition-colors hover:bg-green-700 disabled:bg-gray-300"
            >
              {isSubmitting ? 'Processing...' : `Add All Three — ${price}/mo`}
            </button>
            <button
              onClick={handleDecline}
              className="mt-2 w-full py-3 text-sm text-gray-400 transition-colors hover:text-gray-600"
            >
              No thanks — skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  const product = UPSELL_PRODUCTS[step.key as ProductKey];
  if (!product) return null;

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
      className="fixed inset-0 z-50 flex flex-col bg-white"
    >
      <div className="flex-shrink-0 py-4 text-center">
        <span className="inline-block rounded-full bg-green-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
          One-Time Offer
        </span>
        <h2 className="mt-2 text-xl font-bold" style={{ color: '#0c2631' }}>
          {product.headline}
        </h2>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6">
        <div className="w-full max-w-lg overflow-hidden rounded-xl border-2 border-green-600 shadow-lg">
          <div className="p-6">
            <h3 className="mb-2 text-xl font-bold" style={{ color: '#0c2631' }}>
              {product.name}
            </h3>
            <p className="mb-4 text-gray-500">{product.description}</p>
            <div className="mb-4 space-y-2">
              {product.bullets.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <span className="text-green-600">&#10003;</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <span className="text-3xl font-bold text-green-600">{product.price}</span>
              <p className="mt-1 text-sm text-gray-500">Only {product.daily} for better results</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-gray-100 pb-[env(safe-area-inset-bottom)] pt-4">
        <div className="mx-auto max-w-md px-6">
          {paymentMethod && (
            <div className="mb-2 flex items-center justify-center gap-2 text-sm text-gray-500">
              <span>
                Charging {brandDisplay(paymentMethod.brand)} ending in {paymentMethod.last4}
              </span>
            </div>
          )}
          {error && <p className="mb-2 text-center text-sm text-red-500">{error}</p>}
          <button
            onClick={handleAdd}
            disabled={isSubmitting}
            className="w-full rounded-xl bg-green-600 py-4 font-bold text-white shadow-lg transition-colors hover:bg-green-700 disabled:bg-gray-300"
          >
            {isSubmitting ? 'Processing...' : `Add to My Order — ${product.price}`}
          </button>
          <button
            onClick={handleDecline}
            className="mt-2 w-full py-3 text-sm text-gray-400 transition-colors hover:text-gray-600"
          >
            No thanks — skip
          </button>
        </div>
      </div>
    </div>
  );
}
