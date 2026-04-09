'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getGroupedPlans,
  formatPlanPrice,
  getPlanById,
  getClinicSurcharge,
} from '@/config/billingPlans';
import { apiFetch } from '@/lib/api/fetch';
import { getCardNetworkLogo } from '@/lib/constants/brand-assets';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe, StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripeCache = new Map<string, Promise<Stripe | null>>();

function getStripeInstance(
  publishableKey?: string,
  connectedAccountId?: string | null,
): Promise<Stripe | null> | null {
  const pk = publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!pk) return null;

  const cacheKey = connectedAccountId ? `${pk}__${connectedAccountId}` : pk;
  if (!stripeCache.has(cacheKey)) {
    const opts = connectedAccountId ? { stripeAccount: connectedAccountId } : undefined;
    stripeCache.set(cacheKey, loadStripe(pk, opts));
  }
  return stripeCache.get(cacheKey)!;
}

interface SavedCard {
  id: number | string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  isDefault: boolean;
  source?: 'local' | 'stripe';
  stripePaymentMethodId?: string;
}

interface ProcessPaymentFormProps {
  patientId: number;
  patientName: string;
  clinicSubdomain?: string | null;
  onSuccess: () => void;
}

export function ProcessPaymentForm({ patientId, patientName, clinicSubdomain, onSuccess }: ProcessPaymentFormProps) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [amountInCents, setAmountInCents] = useState(50);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      let pk: string | undefined;
      let connectedAccountId: string | null = null;
      try {
        const res = await apiFetch(`/api/stripe/publishable-key?patientId=${patientId}`);
        if (res.ok) {
          const data = await res.json();
          pk = data.publishableKey;
          connectedAccountId = data.connectedAccountId || null;
        }
      } catch {
        // Fall through to default key
      }

      const promise = getStripeInstance(pk, connectedAccountId);
      if (!cancelled && promise) {
        setStripePromise(promise);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [patientId]);

  const handleAmountUpdate = useCallback((cents: number) => {
    setAmountInCents(Math.max(cents, 50));
  }, []);

  const elementsOptions: StripeElementsOptions = {
    mode: 'payment' as const,
    amount: amountInCents,
    currency: 'usd',
    setupFutureUsage: 'off_session',
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#4fa77e',
        colorText: '#1a1a1a',
        colorDanger: '#ef4444',
        fontFamily: 'inherit',
        borderRadius: '6px',
      },
    },
  };

  if (!stripePromise) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-xl font-semibold">Process Payment for {patientName}</h3>
        <p className="text-sm text-gray-400">Loading payment form...</p>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <ProcessPaymentFormContent
        patientId={patientId}
        patientName={patientName}
        clinicSubdomain={clinicSubdomain}
        onSuccess={onSuccess}
        onAmountChange={handleAmountUpdate}
      />
    </Elements>
  );
}

interface FormContentProps extends ProcessPaymentFormProps {
  onAmountChange: (amountInCents: number) => void;
}

interface CartItem {
  id: string;
  planId?: string;
  description: string;
  amount: number;
  isRecurring?: boolean;
  months?: number;
  catalogPriceCents?: number;
  discountMode?: 'first_only' | 'all_recurring';
}

let _cartIdCounter = 0;
function nextCartId() { return `cart_${++_cartIdCounter}_${Date.now()}`; }

function ProcessPaymentFormContent({ patientId, patientName, clinicSubdomain, onSuccess, onAmountChange }: FormContentProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [includeCcFee, setIncludeCcFee] = useState(true);

  const [paymentMode, setPaymentMode] = useState<'saved' | 'new'>('new');
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | number | null>(null);
  const [loadingCards, setLoadingCards] = useState(true);

  const [saveCard, setSaveCard] = useState(true);

  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<{ [key: string]: string }>({});
  const [formSubmitted, setFormSubmitted] = useState(false);
  const groupedPlans = getGroupedPlans(clinicSubdomain);
  const surcharge = getClinicSurcharge(clinicSubdomain);

  const stripeReady = !!stripe && !!elements;

  const subtotal = cartItems.reduce((sum, item) => sum + item.amount, 0);
  const ccFeeAmount = surcharge.ccProcessingFeeRate && includeCcFee
    ? Math.round(subtotal * surcharge.ccProcessingFeeRate * 100) / 100
    : 0;
  const totalAmount = subtotal + ccFeeAmount;

  const recurringItems = cartItems.filter((i) => i.isRecurring);
  const hasRecurring = recurringItems.length > 0;
  const singleRecurring = recurringItems.length === 1 ? recurringItems[0] : null;

  useEffect(() => {
    onAmountChange(Math.round(totalAmount * 100));
  }, [totalAmount, onAmountChange]);

  useEffect(() => {
    const fetchSavedCards = async () => {
      try {
        const response = await apiFetch(`/api/payment-methods?patientId=${patientId}`);
        if (response.ok) {
          const data = await response.json();
          const cards: SavedCard[] = data.data || [];
          setSavedCards(cards);
          if (cards.length > 0) {
            setPaymentMode('saved');
            const defaultCard = cards.find((c) => c.isDefault) || cards[0];
            setSelectedCardId(defaultCard.id);
          }
        }
      } catch {
        // Non-blocking
      } finally {
        setLoadingCards(false);
      }
    };
    fetchSavedCards();
  }, [patientId]);

  useEffect(() => {
    if (hasRecurring) setSaveCard(true);
  }, [hasRecurring]);

  const handleAddPlan = (planId: string) => {
    if (!planId) return;
    const plan = getPlanById(planId, clinicSubdomain);
    if (!plan) return;
    setCartItems((prev) => [
      ...prev,
      {
        id: nextCartId(),
        planId: plan.id,
        description: plan.description,
        amount: plan.price / 100,
        isRecurring: !!plan.isRecurring,
        months: plan.months,
        catalogPriceCents: plan.price,
      },
    ]);
  };

  const handleAddCustomItem = () => {
    setCartItems((prev) => [...prev, { id: nextCartId(), description: '', amount: 0 }]);
  };

  const handleRemoveItem = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: 'description' | 'amount', value: string | number) => {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === 'amount') {
          const parsed = typeof value === 'string' ? parseFloat(value) : value;
          return { ...item, amount: Number.isNaN(parsed) ? 0 : parsed };
        }
        return { ...item, description: String(value) };
      })
    );
  };

  const handleItemDiscountMode = (id: string, mode: 'first_only' | 'all_recurring') => {
    setCartItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, discountMode: mode } : item))
    );
  };

  const isCardExpired = (month: number, year: number) => {
    const now = new Date();
    return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
  };

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (paymentMode === 'saved') {
      if (!selectedCardId) {
        errors.savedCard = 'Please select a payment method';
      } else {
        const card = savedCards.find((c) => c.id === selectedCardId);
        if (card && isCardExpired(card.expiryMonth, card.expiryYear)) {
          errors.savedCard = 'Selected card is expired. Please choose another or enter a new card.';
        }
      }
    }

    const validItems = cartItems.filter((i) => i.description && i.amount > 0);
    if (validItems.length === 0) {
      errors.cart = 'Add at least one item with a description and amount';
    }

    if (totalAmount <= 0) {
      errors.cart = 'Total amount must be greater than 0';
    }

    setCardErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setFormSubmitted(true);

    if (!validateForm()) {
      setError('Please fix the errors in the form');
      return;
    }

    setSubmitting(true);

    try {
      if (paymentMode === 'new') {
        if (!stripe || !elements) {
          throw new Error('Payment form not ready. Please refresh and try again.');
        }
        const { error: submitError } = await elements.submit();
        if (submitError) {
          throw new Error(submitError.message || 'Card validation failed');
        }
      }

      const validItems = cartItems.filter((i) => i.description && i.amount > 0);
      const allLineItems = [
        ...validItems.map((i) => ({
          description: i.description,
          amount: Math.round(i.amount * 100),
          planId: i.planId,
        })),
        ...(ccFeeAmount > 0
          ? [{ description: surcharge.ccProcessingFeeLabel, amount: Math.round(ccFeeAmount * 100) }]
          : []),
      ];

      const primaryDescription = validItems.length === 1
        ? validItems[0].description
        : `${validItems[0]?.description || 'Payment'} (+${validItems.length - 1} more)`;

      const subscriptions = recurringItems.map((item) => {
        const plan = item.planId ? getPlanById(item.planId, clinicSubdomain) : null;
        const months = plan?.months || item.months || 1;
        const catalogCents = item.catalogPriceCents;
        const currentCents = Math.round(item.amount * 100);
        const isDiscounted = catalogCents != null && currentCents !== catalogCents;
        return {
          planId: item.planId || item.id,
          planName: plan?.name || item.description,
          interval: 'month',
          intervalCount: months,
          amountCents: currentCents,
          ...(plan?.stripePriceId ? { stripePriceId: plan.stripePriceId } : {}),
          ...(isDiscounted ? {
            discountMode: item.discountMode || 'first_only',
            catalogAmountCents: catalogCents,
          } : {}),
        };
      });

      const subscription = subscriptions.length === 1 ? subscriptions[0] : null;

      const payload: Record<string, unknown> = {
        patientId,
        amount: Math.round(totalAmount * 100),
        description: primaryDescription,
        lineItems: allLineItems,
        subscription,
        subscriptions: subscriptions.length > 0 ? subscriptions : undefined,
        notes,
        saveCard: paymentMode === 'new' ? saveCard : undefined,
      };

      if (paymentMode === 'saved' && selectedCardId) {
        payload.paymentMethodId = selectedCardId;
      } else {
        payload.useStripeElements = true;
      }

      const res = await apiFetch('/api/stripe/payments/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to process payment');
      }

      if (data.requiresStripeConfirmation && data.clientSecret) {
        if (paymentMode === 'new') {
          if (!stripe || !elements) {
            throw new Error('Payment form not ready. Please refresh and try again.');
          }

          const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
            elements,
            clientSecret: data.clientSecret,
            confirmParams: { return_url: window.location.href },
            redirect: 'if_required',
          });

          if (confirmError) {
            throw new Error(confirmError.message || 'Payment failed');
          }

          const confirmRes = await apiFetch('/api/stripe/payments/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentIntentId: data.paymentIntentId,
              stripePaymentMethodId: paymentIntent?.payment_method,
              localPaymentMethodId: data.localPaymentMethodId ?? undefined,
            }),
          });

          const confirmData = await confirmRes.json();
          if (!confirmRes.ok) {
            throw new Error(confirmData.error || 'Failed to confirm payment');
          }
        } else {
          if (!stripe) {
            throw new Error('Payment form not ready. Please refresh and try again.');
          }

          const savedCard = savedCards.find(c => c.id === selectedCardId);
          const pmId = savedCard?.stripePaymentMethodId || String(selectedCardId);

          const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
            data.clientSecret,
            { payment_method: pmId }
          );

          if (confirmError) {
            throw new Error(confirmError.message || 'Payment failed');
          }

          const confirmRes = await apiFetch('/api/stripe/payments/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentIntentId: data.paymentIntentId,
              stripePaymentMethodId: paymentIntent?.payment_method,
              localPaymentMethodId: data.localPaymentMethodId ?? undefined,
            }),
          });

          const confirmData = await confirmRes.json();
          if (!confirmRes.ok) {
            throw new Error(confirmData.error || 'Failed to confirm payment');
          }
        }
      }

      setSuccessMessage(
        recurringItems.length > 0
          ? `Payment processed and ${recurringItems.length} recurring subscription${recurringItems.length > 1 ? 's' : ''} set up successfully!`
          : 'Payment processed successfully!'
      );

      setCartItems([]);
      setIncludeCcFee(true);
      setNotes('');
      setSaveCard(true);
      setCardErrors({});
      setFormSubmitted(false);

      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setCartItems([]);
    setIncludeCcFee(true);
    setNotes('');
    setError(null);
    setSuccessMessage(null);
    setCardErrors({});
    setSaveCard(true);
    setFormSubmitted(false);
    if (savedCards.length > 0) {
      setPaymentMode('saved');
      const defaultCard = savedCards.find((c) => c.isDefault) || savedCards[0];
      setSelectedCardId(defaultCard.id);
    } else {
      setPaymentMode('new');
      setSelectedCardId(null);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-xl font-semibold">Process Payment for {patientName}</h3>

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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Add from Plan */}
        <div>
          <label htmlFor="addPlan" className="mb-1 block text-sm font-medium text-gray-700">
            Add Billing Plan
          </label>
          <div className="flex gap-2">
            <select
              id="addPlan"
              defaultValue=""
              onChange={(e: any) => {
                handleAddPlan(e.target.value);
                e.target.value = '';
              }}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]"
            >
              <option value="" disabled>-- Select a plan to add --</option>
              {Object.entries(groupedPlans).map(([groupName, group]) => (
                <optgroup key={groupName} label={group.label}>
                  {group.plans.map((plan: any) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {formatPlanPrice(plan.price)}
                      {plan.isRecurring ? ' (Recurring)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddCustomItem}
              className="whitespace-nowrap rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              + Custom Item
            </button>
          </div>
        </div>

        {/* Cart Items */}
        {cartItems.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Items ({cartItems.length})
            </label>
            <div className="space-y-2">
              {cartItems.map((item) => {
                const catalogDollars = item.catalogPriceCents ? item.catalogPriceCents / 100 : null;
                const isAdjusted = catalogDollars !== null && item.amount !== catalogDollars;
                return (
                  <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#4fa77e] focus:ring-1 focus:ring-[#4fa77e]"
                        placeholder="Description"
                      />
                      <div className="relative w-28">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.amount || ''}
                          onChange={(e) => handleItemChange(item.id, 'amount', e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-[#4fa77e] focus:ring-1 focus:ring-[#4fa77e]"
                          placeholder="0.00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="rounded-lg px-2 text-red-500 hover:bg-red-50"
                        title="Remove"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {item.isRecurring && (
                      <p className="mt-1 text-xs text-amber-600">
                        Recurring every {item.months === 1 ? 'month' : `${item.months} months`}
                      </p>
                    )}
                    {item.isRecurring && isAdjusted && catalogDollars !== null && (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                        <div className="mb-1.5 flex items-center gap-2">
                          <p className="text-[11px] text-amber-700">
                            {item.amount < catalogDollars
                              ? `Discount of $${(catalogDollars - item.amount).toFixed(2)} from $${catalogDollars.toFixed(2)}`
                              : `+$${(item.amount - catalogDollars).toFixed(2)} from $${catalogDollars.toFixed(2)}`}
                          </p>
                          <button type="button" onClick={() => handleItemChange(item.id, 'amount', catalogDollars)} className="text-[11px] font-medium text-[#4fa77e] hover:underline">Reset</button>
                        </div>
                        <div className="flex gap-1 rounded bg-amber-100 p-0.5">
                          <button type="button" onClick={() => handleItemDiscountMode(item.id, 'first_only')}
                            className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${(item.discountMode || 'first_only') === 'first_only' ? 'bg-white text-amber-900 shadow-sm' : 'text-amber-700'}`}>
                            First payment only
                          </button>
                          <button type="button" onClick={() => handleItemDiscountMode(item.id, 'all_recurring')}
                            className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${item.discountMode === 'all_recurring' ? 'bg-white text-amber-900 shadow-sm' : 'text-amber-700'}`}>
                            All future charges
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {formSubmitted && cardErrors.cart && (
              <p className="mt-1 text-sm text-red-600">{cardErrors.cart}</p>
            )}
          </div>
        )}

        {cartItems.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Select a plan or add a custom item to begin
          </div>
        )}

        {/* CC Processing Fee Toggle */}
        {surcharge.ccProcessingFeeRate && cartItems.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ccFeeToggle"
                checked={includeCcFee}
                onChange={(e) => setIncludeCcFee(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
              />
              <label htmlFor="ccFeeToggle" className="text-sm text-gray-700">
                {surcharge.ccProcessingFeeLabel}
              </label>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {includeCcFee ? `$${ccFeeAmount.toFixed(2)}` : '$0.00'}
            </span>
          </div>
        )}

        {/* Recurring subscription info */}
        {recurringItems.length > 1 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <strong>{recurringItems.length} recurring subscriptions</strong> will be created for this transaction.
          </div>
        )}

        {recurringItems.length > 0 && (
          <div className="space-y-1">
            {recurringItems.map((item) => (
              <p key={item.id} className="text-sm text-amber-600">
                A recurring subscription will be created for <strong>{item.description}</strong>
                {' '}({item.months === 1 ? 'billed monthly' : `billed every ${item.months} months`})
              </p>
            ))}
          </div>
        )}

        {/* Payment Method Selection */}
        <div className="border-t pt-4">
          <h4 className="mb-4 text-lg font-medium text-gray-900">Payment Method</h4>

          {loadingCards ? (
            <div className="animate-pulse space-y-3">
              <div className="h-10 rounded bg-gray-100" />
              <div className="h-16 rounded bg-gray-100" />
            </div>
          ) : (
            <>
              {savedCards.length > 0 && (
                <div className="mb-4 flex gap-2">
                  <button type="button" onClick={() => setPaymentMode('saved')}
                    className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${paymentMode === 'saved' ? 'border-[#4fa77e] bg-green-50 text-[#4fa77e]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    Use Saved Card
                  </button>
                  <button type="button" onClick={() => setPaymentMode('new')}
                    className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${paymentMode === 'new' ? 'border-[#4fa77e] bg-green-50 text-[#4fa77e]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    Enter New Card
                  </button>
                </div>
              )}

              {paymentMode === 'saved' && savedCards.length > 0 && (
                <div className="space-y-2">
                  {formSubmitted && cardErrors.savedCard && (
                    <p className="mb-2 text-sm text-red-600">{cardErrors.savedCard}</p>
                  )}
                  {savedCards.map((card) => {
                    const expired = isCardExpired(card.expiryMonth, card.expiryYear);
                    const logo = getCardNetworkLogo(card.brand);
                    return (
                      <label key={card.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-colors ${selectedCardId === card.id ? 'border-[#4fa77e] bg-green-50' : expired ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="radio" name="savedCard" value={String(card.id)} checked={selectedCardId === card.id}
                          onChange={() => setSelectedCardId(card.id)} disabled={expired}
                          className="h-4 w-4 border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]" />
                        <div className="flex h-8 w-12 items-center justify-center rounded bg-gray-100">
                          {logo ? (
                            <img src={logo} alt={card.brand} className="h-6 w-10 object-contain" />
                          ) : (
                            <svg className="h-5 w-7 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <rect x="1" y="4" width="22" height="16" rx="2" strokeWidth="2" />
                              <line x1="1" y1="10" x2="23" y2="10" strokeWidth="2" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">•••• {card.last4}</span>
                            {card.isDefault && <span className="rounded bg-[#4fa77e] px-1.5 py-0.5 text-[10px] font-medium text-white">Default</span>}
                            {expired && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">Expired</span>}
                          </div>
                          <span className="text-xs text-gray-500">
                            {card.cardholderName ? `${card.cardholderName} • ` : ''}
                            Expires {String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {paymentMode === 'new' && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-1">
                    <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                      <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-xs font-medium text-gray-500">Secure card entry powered by Stripe</span>
                    </div>
                    <div className="rounded-md bg-white p-3">
                      <PaymentElement />
                    </div>
                  </div>
                  {!stripeReady && <p className="text-sm text-gray-400">Loading secure payment form...</p>}
                  <label className="mt-2 flex items-center">
                    <input type="checkbox" checked={saveCard}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSaveCard(e.target.checked)}
                      disabled={hasRecurring}
                      className="mr-2 rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]" />
                    <span className="text-sm text-gray-700">
                      Save card for future payments{hasRecurring && ' (required for recurring subscription)'}
                    </span>
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700">Notes (Optional)</label>
          <textarea id="notes" value={notes} onChange={(e: any) => setNotes(e.target.value)} rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]"
            placeholder="Additional notes about this payment..." />
        </div>

        {/* Summary */}
        {cartItems.length > 0 && (
          <div className="space-y-2 rounded-lg bg-gray-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Patient:</span>
              <span className="font-medium">{patientName}</span>
            </div>
            {cartItems.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-500 truncate max-w-[60%]">{item.description || 'Item'}</span>
                <span className="font-medium">${item.amount.toFixed(2)}</span>
              </div>
            ))}
            {ccFeeAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{surcharge.ccProcessingFeeLabel}</span>
                <span className="font-medium">${ccFeeAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-semibold">
              <span className="text-gray-900">Total:</span>
              <span className="text-[#4fa77e]">${totalAmount.toFixed(2)}</span>
            </div>
            {paymentMode === 'saved' && selectedCardId && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Card:</span>
                <span className="font-medium">
                  {(() => { const card = savedCards.find((c) => c.id === selectedCardId); return card ? `•••• ${card.last4}` : 'Saved card'; })()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleClear}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200">
            Clear
          </button>
          <button type="submit" disabled={submitting || cartItems.length === 0}
            className="rounded-lg bg-[#4fa77e] px-6 py-2 text-white transition-colors hover:bg-[#3f8660] disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? 'Processing...' : hasRecurring ? `Start Subscription${recurringItems.length > 1 ? 's' : ''}` : `Charge $${totalAmount.toFixed(2)}`}
          </button>
        </div>
      </form>
    </div>
  );
}
