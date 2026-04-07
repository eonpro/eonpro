'use client';

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type FormEvent,
  type ReactNode,
} from 'react';

import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';

import { apiFetch } from '@/lib/api/fetch';
import { getCardNetworkLogo } from '@/lib/constants/brand-assets';
import { logger } from '@/lib/logger';


const stripeCache = new Map<string, Promise<Stripe | null>>();

function getStripeInstance(
  publishableKey?: string,
  connectedAccountId?: string | null,
): Promise<Stripe | null> | null {
  const envPk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  const pk = publishableKey?.trim() ? publishableKey.trim() : envPk;
  if (!pk) return null;
  const cacheKey = connectedAccountId ? `${pk}__${connectedAccountId}` : pk;
  let promise = stripeCache.get(cacheKey);
  if (!promise) {
    const opts = connectedAccountId ? { stripeAccount: connectedAccountId } : undefined;
    promise = loadStripe(pk, opts);
    stripeCache.set(cacheKey, promise);
  }
  return promise;
}

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

interface SetupIntentPayload {
  clientSecret: string;
  stripePublishableKey?: string;
  stripeConnectedAccountId?: string | null;
}

async function savePaymentMethodAfterSetup(args: {
  patientId: number;
  setupIntentId: string;
  stripePaymentMethodId: string;
  setAsDefault: boolean;
}): Promise<void> {
  const saveRes = await apiFetch('/api/payment-methods/save-stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientId: args.patientId,
      setupIntentId: args.setupIntentId,
      stripePaymentMethodId: args.stripePaymentMethodId,
      setAsDefault: args.setAsDefault,
    }),
  });

  const saveData: { error?: string } = await saveRes.json();
  if (!saveRes.ok) {
    throw new Error(saveData.error ?? 'Failed to save card');
  }
}

interface SetupIntentApiJson {
  clientSecret?: string;
  stripePublishableKey?: string;
  stripeConnectedAccountId?: string | null;
  error?: string;
}

async function requestPatientSetupIntent(
  patientId: number,
): Promise<{ ok: true; data: SetupIntentPayload } | { ok: false; error: string }> {
  const setupRes = await apiFetch('/api/payment-methods/setup-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patientId }),
  });
  const setupResponse = (await setupRes.json()) as SetupIntentApiJson;
  if (!setupRes.ok) {
    return { ok: false, error: setupResponse.error ?? 'Failed to initialize payment setup' };
  }
  if (!setupResponse.clientSecret) {
    return { ok: false, error: 'Invalid setup response from server' };
  }
  return {
    ok: true,
    data: {
      clientSecret: setupResponse.clientSecret,
      stripePublishableKey: setupResponse.stripePublishableKey,
      stripeConnectedAccountId: setupResponse.stripeConnectedAccountId ?? null,
    },
  };
}

function paymentMethodIdsFromSetupIntent(setupIntent: {
  id?: string;
  payment_method?: string | { id?: string };
}): { setupIntentId: string; stripePaymentMethodId: string } {
  const pm = setupIntent.payment_method;
  const stripePaymentMethodId = typeof pm === 'string' ? pm : pm?.id;
  const setupIntentId = setupIntent.id;
  if (!stripePaymentMethodId || !setupIntentId) {
    throw new Error('Missing payment method after confirmation');
  }
  return { setupIntentId, stripePaymentMethodId };
}

function AddCardForm({
  patientId,
  cardsLength,
  setAsDefault,
  setSetAsDefault,
  onCancel,
  onAdded,
  setError,
}: {
  patientId: number;
  cardsLength: number;
  setAsDefault: boolean;
  setSetAsDefault: (v: boolean) => void;
  onCancel: () => void;
  onAdded: () => Promise<void>;
  setError: (msg: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      setError('Payment form not ready. Please try again.');
      return;
    }

    setSubmitting(true);

    try {
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: typeof window !== 'undefined' ? window.location.href : '' },
        redirect: 'if_required',
      });

      if (stripeError) {
        throw new Error(stripeError.message ?? 'Card verification failed');
      }

      const { setupIntentId, stripePaymentMethodId } = paymentMethodIdsFromSetupIntent(
        (setupIntent ?? {}) as { id?: string; payment_method?: string | { id?: string } },
      );

      await savePaymentMethodAfterSetup({
        patientId,
        setupIntentId,
        stripePaymentMethodId,
        setAsDefault: setAsDefault || cardsLength === 0,
      });

      await onAdded();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage !== '' ? errorMessage : 'Failed to add payment method');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-4"
    >
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-1">
        <div className="flex items-center gap-2 px-3 pb-1 pt-2">
          <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span className="text-xs font-medium text-gray-500">Secure payment powered by Stripe</span>
        </div>
        <div className="rounded-md bg-white p-3">
          <PaymentElement />
        </div>
      </div>

      {cardsLength > 0 && (
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
          disabled={submitting || !stripe || !elements}
          className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3f8660] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Card'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 transition-colors hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function getCardIcon(brand: string): ReactNode {
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
}

function isCardExpired(month: number, year: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth);
}

function SavedCardsBlock({
  cards,
  showAddCard,
  onStartAdd,
  onSetDefault,
  onRemove,
}: {
  cards: SavedCard[];
  showAddCard: boolean;
  onStartAdd: () => void;
  onSetDefault: (cardId: number) => void;
  onRemove: (cardId: number) => void;
}) {
  if (cards.length === 0 && !showAddCard) {
    return (
      <div className="py-8 text-center text-gray-500">
        <CreditCard className="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <p>No payment methods saved</p>
        <button type="button" onClick={onStartAdd} className="mt-3 text-[#4fa77e] hover:underline">
          Add your first card
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map((card: SavedCard) => {
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
                    <span>•••• {card.last4}</span>
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
                    {card.cardholderName ? `${card.cardholderName} • ` : ''}
                    Expires {String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}
                    {isCardExpired(card.expiryMonth, card.expiryYear) && (
                      <span className="ml-2 font-medium text-red-600">Expired</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isStripeOnly && !card.isDefault && (
                  <button
                    type="button"
                    onClick={() => void onSetDefault(Number(card.id))}
                    className="text-sm text-[#4fa77e] hover:underline"
                  >
                    Set as default
                  </button>
                )}
                {!isStripeOnly && (
                  <button
                    type="button"
                    onClick={() => void onRemove(Number(card.id))}
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
  );
}

export default function PatientPaymentMethods({ patientId, patientName }: PatientPaymentMethodsProps) {
  void patientName;
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);

  const [setupData, setSetupData] = useState<SetupIntentPayload | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupFetchError, setSetupFetchError] = useState<string | null>(null);

  // Fetch saved cards
  const fetchCards = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/payment-methods?patientId=${patientId}`);
      if (!response.ok) throw new Error('Failed to fetch cards');
      const data = await response.json();
      setCards(data.data ?? []);
    } catch (err: unknown) {
      logger.error('Failed to fetch payment methods:', err);
      setError('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void fetchCards();
  }, [fetchCards]);

  // When Add Card is shown: create SetupIntent and load clinic publishable key in one request.
  useEffect(() => {
    if (!showAddCard) {
      setSetupData(null);
      setSetupFetchError(null);
      return;
    }

    let cancelled = false;
    setSetupLoading(true);
    setSetupFetchError(null);
    setSetupData(null);

    void (async () => {
      try {
        const result = await requestPatientSetupIntent(patientId);
        if (cancelled) return;
        if (!result.ok) {
          setSetupFetchError(result.error);
          return;
        }
        setSetupData(result.data);
      } catch (err: unknown) {
        if (!cancelled) {
          setSetupFetchError(err instanceof Error ? err.message : 'Failed to initialize payment setup');
        }
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showAddCard, patientId]);

  // eslint-disable-next-line @typescript-eslint/promise-function-async -- sync factory; Stripe Elements expects Promise<Stripe>, not a Promise wrapper
  const stripePromise = useMemo((): Promise<Stripe | null> | null => {
    if (!setupData) return null;
    return getStripeInstance(setupData.stripePublishableKey, setupData.stripeConnectedAccountId);
  }, [setupData]);

  const handleAddCardCancel = useCallback(() => {
    setShowAddCard(false);
    setError(null);
    setSetupFetchError(null);
  }, []);

  const handleAddCardSuccess = useCallback(async () => {
    await fetchCards();
    setSetAsDefault(false);
    setShowAddCard(false);
    setSuccessMessage('Payment method added successfully');
    setTimeout(() => setSuccessMessage(null), 5000);
  }, [fetchCards]);

  // Remove card
  const handleRemoveCard = async (cardId: number) => {
    // eslint-disable-next-line no-alert -- deliberate destructive confirmation
    if (!window.confirm('Are you sure you want to remove this payment method?')) {
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
    } catch {
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
    } catch {
      setError('Failed to update default payment method');
    }
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

        <SavedCardsBlock
          cards={cards}
          showAddCard={showAddCard}
          onStartAdd={() => setShowAddCard(true)}
          onSetDefault={(id) => void handleSetDefault(id)}
          onRemove={(id) => void handleRemoveCard(id)}
        />

        {/* Add Card Form (Stripe Payment Element — PCI DSS compliant) */}
        {showAddCard && (
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-4 text-lg font-medium">Add New Payment Method</h3>
            {setupLoading && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
                Loading secure payment form…
              </div>
            )}
            {setupFetchError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {setupFetchError}
              </div>
            )}
            {!setupLoading && setupData && stripePromise && (
              <Elements
                key={setupData.clientSecret}
                stripe={stripePromise}
                options={{
                  clientSecret: setupData.clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#4fa77e',
                      fontFamily: 'inherit',
                    },
                  },
                }}
              >
                <AddCardForm
                  patientId={patientId}
                  cardsLength={cards.length}
                  setAsDefault={setAsDefault}
                  setSetAsDefault={setSetAsDefault}
                  onCancel={handleAddCardCancel}
                  onAdded={handleAddCardSuccess}
                  setError={setError}
                />
              </Elements>
            )}
            {!setupLoading && setupData && !stripePromise && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Stripe is not configured
              </div>
            )}
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
