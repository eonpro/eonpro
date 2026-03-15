'use client';

import { useState, useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api/fetch';
import { getCardNetworkLogo } from '@/lib/constants/brand-assets';
import { loadStripe, Stripe, StripeCardElement } from '@stripe/stripe-js';

const stripePublishableKey =
  process.env.NEXT_PUBLIC_EONMEDS_STRIPE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  '';
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

// Icon components
const CreditCard = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
    />
  </svg>
);

const Plus = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const Trash2 = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const Shield = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

interface SavedCard {
  id: number | string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  isDefault: boolean;
  createdAt: Date;
  source?: 'local' | 'stripe';
  stripePaymentMethodId?: string;
}

interface PatientPaymentMethodsProps {
  patientId: number;
  patientName: string;
}

export default function PatientPaymentMethods({
  patientId,
  patientName,
}: PatientPaymentMethodsProps) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stripeCardRef = useRef<HTMLDivElement>(null);
  const stripeElementRef = useRef<StripeCardElement | null>(null);
  const stripeInstanceRef = useRef<Stripe | null>(null);

  // Fetch saved cards
  const fetchCards = async () => {
    try {
      const response = await apiFetch(`/api/payment-methods?patientId=${patientId}`);
      if (!response.ok) throw new Error('Failed to fetch cards');
      const data = await response.json();
      setCards(data.data || []);
    } catch (err: unknown) {
      
      logger.error('Failed to fetch payment methods:', err);
      setError('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, [patientId]);

  // Mount Stripe CardElement when Add Card form is shown
  useEffect(() => {
    if (!showAddCard) return;

    let mounted = true;
    const mountCard = async () => {
      if (!stripePromise) {
        logger.error('Stripe publishable key not configured');
        return;
      }
      const stripeInstance = await stripePromise;
      if (!stripeInstance || !mounted) return;
      stripeInstanceRef.current = stripeInstance;

      // Wait for DOM ref
      await new Promise((r) => setTimeout(r, 50));
      if (!stripeCardRef.current || !mounted) return;

      const elements = stripeInstance.elements();
      const card = elements.create('card', {
        style: {
          base: {
            fontSize: '16px',
            color: '#1a1a1a',
            fontFamily: 'inherit',
            '::placeholder': { color: '#9ca3af' },
          },
          invalid: { color: '#ef4444' },
        },
      });
      card.mount(stripeCardRef.current);
      stripeElementRef.current = card;
    };
    mountCard();

    return () => {
      mounted = false;
      stripeElementRef.current?.unmount();
      stripeElementRef.current = null;
    };
  }, [showAddCard]);

  // Add card via Stripe SetupIntent (PCI DSS compliant — no raw card data touches our server)
  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!stripeInstanceRef.current || !stripeElementRef.current) {
      setError('Payment form not ready. Please try again.');
      return;
    }

    setSubmitting(true);

    try {
      // Ask server to create a SetupIntent
      const setupRes = await apiFetch('/api/payment-methods/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId }),
      });

      const setupData = await setupRes.json();
      if (!setupRes.ok) {
        throw new Error(setupData.error || 'Failed to initialize card setup');
      }

      // Confirm with Stripe.js (card data goes directly to Stripe, never to our server)
      const { error: stripeError, setupIntent } = await stripeInstanceRef.current.confirmCardSetup(
        setupData.clientSecret,
        { payment_method: { card: stripeElementRef.current } }
      );

      if (stripeError) {
        throw new Error(stripeError.message || 'Card verification failed');
      }

      // Tell server the SetupIntent succeeded so it can save the payment method reference
      const saveRes = await apiFetch('/api/payment-methods/save-stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          setupIntentId: setupIntent?.id,
          stripePaymentMethodId: setupIntent?.payment_method,
          setAsDefault: setAsDefault || cards.length === 0,
        }),
      });

      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(saveData.error || 'Failed to save card');
      }

      await fetchCards();
      setSetAsDefault(false);
      setShowAddCard(false);
      stripeElementRef.current?.clear();

      setSuccessMessage('Payment method added successfully');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage || 'Failed to add payment method');
    } finally {
      setSubmitting(false);
    }
  };

  // Remove card
  const handleRemoveCard = async (cardId: number) => {
    if (!confirm('Are you sure you want to remove this payment method?')) {
      return;
    }

    try {
        const response = await apiFetch(`/api/payment-methods?id=${cardId}&patientId=${patientId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove card');
      }

      await fetchCards();
      setSuccessMessage('Payment method removed');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      
      setError('Failed to remove payment method');
    }
  };

  // Set default card
  const handleSetDefault = async (cardId: number) => {
    try {
        const response = await apiFetch('/api/payment-methods/default', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: cardId,
          patientId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update default');
      }

      await fetchCards();
      setSuccessMessage('Default payment method updated');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      
      setError('Failed to update default payment method');
    }
  };

  const getCardIcon = (brand: string) => {
    const logo = getCardNetworkLogo(brand);
    if (logo) {
      return <img src={logo} alt={brand} className="h-8 w-12 object-contain" />;
    }
    return (
      <svg className="h-6 w-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeWidth="2" />
        <line x1="1" y1="10" x2="23" y2="10" strokeWidth="2" />
      </svg>
    );
  };

  // Check if card is expired
  const isExpired = (month: number, year: number) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    return year < currentYear || (year === currentYear && month < currentMonth);
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-gray-200"></div>
          <div className="h-24 rounded bg-gray-100"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-[#4fa77e]" />
            <h2 className="text-xl font-semibold">Payment Methods</h2>
            <div className="flex items-center gap-1 rounded bg-green-100 px-2 py-1 text-xs text-green-700">
              <Shield className="h-3 w-3" />
              <span>Encrypted & Secure</span>
            </div>
          </div>
          {!showAddCard && (
            <button
              onClick={() => setShowAddCard(true)}
              className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660]"
            >
              <Plus className="h-4 w-4" />
              Add Card
            </button>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {/* Saved Cards */}
        {cards.length === 0 && !showAddCard ? (
          <div className="py-8 text-center text-gray-500">
            <CreditCard className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p>No payment methods saved</p>
            <button
              onClick={() => setShowAddCard(true)}
              className="mt-3 text-[#4fa77e] hover:underline"
            >
              Add your first card
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card: any) => {
              const isStripeOnly = card.source === 'stripe';
              return (
                <div
                  key={card.id}
                  className={`rounded-lg border p-4 ${
                    card.isDefault ? 'border-[#4fa77e] bg-green-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {getCardIcon(card.brand)}
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          <span>
                            •••• {card.last4}
                          </span>
                          {card.isDefault && (
                            <span className="rounded bg-[#4fa77e] px-2 py-0.5 text-xs text-white">
                              Default
                            </span>
                          )}
                          {isStripeOnly && (
                            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                              Stripe
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {card.cardholderName
                            ? `${card.cardholderName} • `
                            : ''}
                          Expires {String(card.expiryMonth).padStart(2, '0')}/
                          {card.expiryYear}
                          {isExpired(card.expiryMonth, card.expiryYear) && (
                            <span className="ml-2 font-medium text-red-600">Expired</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isStripeOnly && !card.isDefault && (
                        <button
                          onClick={() => handleSetDefault(card.id)}
                          className="text-sm text-[#4fa77e] hover:underline"
                        >
                          Set as default
                        </button>
                      )}
                      {!isStripeOnly && (
                        <button
                          onClick={() => handleRemoveCard(card.id)}
                          className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                          title="Remove card"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Card Form (Stripe Elements - PCI DSS compliant) */}
        {showAddCard && (
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-4 text-lg font-medium">Add New Payment Method</h3>
            <form onSubmit={handleAddCard} className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-1">
                <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                  <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-xs font-medium text-gray-500">Secure card entry powered by Stripe</span>
                </div>
                <div ref={stripeCardRef} className="rounded-md bg-white p-3" />
              </div>

              {cards.length > 0 && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="setAsDefault"
                    checked={setAsDefault}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSetAsDefault(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
                  />
                  <label htmlFor="setAsDefault" className="ml-2 text-sm text-gray-700">
                    Set as default payment method
                  </label>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Card'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCard(false);
                    setError(null);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Security Notice */}
      <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 text-green-600" />
          <div>
            <p className="font-medium text-gray-700">Your payment information is secure</p>
            <p className="mt-1">
              Card details are handled directly by Stripe and never touch our servers. Only a secure
              token and last 4 digits are stored for display. We are PCI DSS compliant.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
