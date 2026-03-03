'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getGroupedPlans,
  formatPlanPrice,
  getPlanById,
} from '@/config/billingPlans';
import { Patient, Provider, Order } from '@/types/models';
import { apiFetch } from '@/lib/api/fetch';
import { getCardNetworkLogo } from '@/lib/constants/brand-assets';
import { loadStripe, Stripe, StripeCardElement } from '@stripe/stripe-js';

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
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [amountInputValue, setAmountInputValue] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState(false);

  // Payment method selection
  const [paymentMode, setPaymentMode] = useState<'saved' | 'new'>('new');
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | number | null>(null);
  const [loadingCards, setLoadingCards] = useState(true);

  // Stripe Elements for PCI-compliant card entry (no raw card data touches our server)
  const [saveCard, setSaveCard] = useState(true);

  // Other states
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<{ [key: string]: string }>({});
  const [formSubmitted, setFormSubmitted] = useState(false);
  const groupedPlans = getGroupedPlans(clinicSubdomain);
  const [stripeReady, setStripeReady] = useState(false);

  const stripeCardRef = useRef<HTMLDivElement>(null);
  const stripeElementRef = useRef<StripeCardElement | null>(null);
  const stripeInstanceRef = useRef<Stripe | null>(null);

  // Mount Stripe CardElement for new card entry on component load
  useEffect(() => {
    let mounted = true;

    const mountCard = async () => {
      const stripeP = getStripeInstance();
      if (!stripeP) return;
      const stripeInstance = await stripeP;
      if (!stripeInstance || !mounted) return;
      stripeInstanceRef.current = stripeInstance;

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
      if (stripeCardRef.current) {
        card.mount(stripeCardRef.current);
        stripeElementRef.current = card;
        setStripeReady(true);
      }
    };
    mountCard();

    return () => {
      mounted = false;
      stripeElementRef.current?.unmount();
      stripeElementRef.current = null;
    };
  }, []);

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
        // Non-blocking: if cards can't be fetched, fall back to new card entry
      } finally {
        setLoadingCards(false);
      }
    };
    fetchSavedCards();
  }, [patientId]);

  useEffect(() => {
    if (selectedPlanId) {
      const plan = getPlanById(selectedPlanId, clinicSubdomain);
      if (plan) {
        const planAmount = plan.price / 100;
        setAmount(planAmount);
        setAmountInputValue(planAmount.toFixed(2));
        setDescription(plan.description);
        setIsRecurring(!!plan.isRecurring);
        if (plan.isRecurring) setSaveCard(true);
      }
    } else {
      setIsRecurring(false);
    }
  }, [selectedPlanId]);

  const handleAmountChange = (value: string) => {
    // Allow typing intermediate values like "8." or "8.0" without normalizing to "8.00"
    const sanitized = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setAmountInputValue(sanitized);
    const parsed = parseFloat(sanitized);
    setAmount(Number.isNaN(parsed) ? 0 : parsed);
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

    if (!amount || amount <= 0) {
      errors.amount = 'Amount must be greater than 0';
    }

    if (!selectedPlanId && (!description || description.trim().length === 0)) {
      errors.description = 'Description is required for custom payments';
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
      const payload: Record<string, unknown> = {
        patientId,
        amount: Math.round(amount * 100),
        description: description || getPlanById(selectedPlanId, clinicSubdomain)?.description || 'Custom Payment',
        subscription: (() => {
          if (!isRecurring) return null;
          const plan = getPlanById(selectedPlanId, clinicSubdomain);
          const months = plan?.months || 1;
          return {
            planId: selectedPlanId,
            planName: plan?.name || '',
            interval: 'month',
            intervalCount: months,
          };
        })(),
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
        if (!stripeInstanceRef.current || !stripeElementRef.current) {
          throw new Error('Payment form not ready. Please refresh and try again.');
        }

        const { error: stripeError, paymentIntent } = await stripeInstanceRef.current.confirmCardPayment(
          data.clientSecret,
          { payment_method: { card: stripeElementRef.current } }
        );

        if (stripeError) {
          throw new Error(stripeError.message || 'Payment failed');
        }

        const confirmRes = await apiFetch('/api/stripe/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: data.paymentIntentId,
            stripePaymentMethodId: paymentIntent?.payment_method,
          }),
        });

        const confirmData = await confirmRes.json();
        if (!confirmRes.ok) {
          throw new Error(confirmData.error || 'Failed to confirm payment');
        }
      }

      setSuccessMessage(
        isRecurring
          ? 'Payment processed and recurring subscription set up successfully!'
          : 'Payment processed successfully!'
      );

      setSelectedPlanId('');
      setAmount(0);
      setDescription('');
      setNotes('');
      setIsRecurring(false);
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
    setSelectedPlanId('');
    setAmount(0);
    setDescription('');
    setNotes('');
    setError(null);
    setSuccessMessage(null);
    setCardErrors({});
    setIsRecurring(false);
    setSaveCard(true);
    setFormSubmitted(false);
    stripeElementRef.current?.clear();
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
        {/* Billing Plan Selection */}
        <div>
          <label htmlFor="billingPlan" className="mb-1 block text-sm font-medium text-gray-700">
            Select Billing Plan (Optional)
          </label>
          <select
            id="billingPlan"
            value={selectedPlanId}
            onChange={(e: any) => setSelectedPlanId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]"
          >
            <option value="">-- Custom Payment --</option>
            {Object.entries(groupedPlans).map(([groupName, group]) => (
              <optgroup key={groupName} label={group.label}>
                {group.plans.map((plan: any) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - {formatPlanPrice(plan.price)}
                    {plan.category.includes('monthly') && ' (Recurring Monthly)'}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {isRecurring && (
            <p className="mt-1 text-sm text-amber-600">
              ⚡ This will set up a recurring subscription
              {(() => {
                const plan = getPlanById(selectedPlanId, clinicSubdomain);
                const m = plan?.months || 1;
                return m === 1 ? ' (billed monthly)' : ` (billed every ${m} months)`;
              })()}
            </p>
          )}
        </div>

        {/* Amount and Description */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="amount" className="mb-1 block text-sm font-medium text-gray-700">
              Amount ($)
            </label>
            <input
              type="text"
              inputMode="decimal"
              id="amount"
              value={amountInputValue}
              onChange={(e) => {
                handleAmountChange(e.target.value);
                if (selectedPlanId) setSelectedPlanId('');
              }}
              className={`w-full rounded-lg border px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                formSubmitted && cardErrors.amount ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="0.00"
              required
            />
            {formSubmitted && cardErrors.amount && (
              <p className="mt-1 text-sm text-red-600">{cardErrors.amount}</p>
            )}
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
            <input
              type="text"
              id="description"
              value={description}
              onChange={(e: any) => {
                setDescription(e.target.value);
                if (selectedPlanId) setSelectedPlanId('');
              }}
              className={`w-full rounded-lg border px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                formSubmitted && cardErrors.description ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Payment description"
              required
            />
            {formSubmitted && cardErrors.description && (
              <p className="mt-1 text-sm text-red-600">{cardErrors.description}</p>
            )}
          </div>
        </div>

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
                  <button
                    type="button"
                    onClick={() => setPaymentMode('saved')}
                    className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      paymentMode === 'saved'
                        ? 'border-[#4fa77e] bg-green-50 text-[#4fa77e]'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Use Saved Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('new')}
                    className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      paymentMode === 'new'
                        ? 'border-[#4fa77e] bg-green-50 text-[#4fa77e]'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Enter New Card
                  </button>
                </div>
              )}

              {/* Saved Card Selection */}
              {paymentMode === 'saved' && savedCards.length > 0 && (
                <div className="space-y-2">
                  {formSubmitted && cardErrors.savedCard && (
                    <p className="mb-2 text-sm text-red-600">{cardErrors.savedCard}</p>
                  )}
                  {savedCards.map((card) => {
                    const expired = isCardExpired(card.expiryMonth, card.expiryYear);
                    const logo = getCardNetworkLogo(card.brand);
                    return (
                      <label
                        key={card.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-colors ${
                          selectedCardId === card.id
                            ? 'border-[#4fa77e] bg-green-50'
                            : expired
                              ? 'border-gray-200 bg-gray-50 opacity-60'
                              : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="savedCard"
                          value={String(card.id)}
                          checked={selectedCardId === card.id}
                          onChange={() => setSelectedCardId(card.id)}
                          disabled={expired}
                          className="h-4 w-4 border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
                        />
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
                            <span className="text-sm font-medium text-gray-900">
                              •••• {card.last4}
                            </span>
                            {card.isDefault && (
                              <span className="rounded bg-[#4fa77e] px-1.5 py-0.5 text-[10px] font-medium text-white">
                                Default
                              </span>
                            )}
                            {expired && (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                Expired
                              </span>
                            )}
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

              {/* New Card Entry via Stripe Elements (PCI DSS compliant) */}
              {paymentMode === 'new' && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-1">
                    <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                      <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-xs font-medium text-gray-500">Secure card entry powered by Stripe</span>
                    </div>
                    <div ref={stripeCardRef} className="rounded-md bg-white p-3" />
                  </div>
                  {!stripeReady && (
                    <p className="text-sm text-gray-400">Loading secure payment form...</p>
                  )}

                  <div className="mt-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={saveCard}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSaveCard(e.target.checked)}
                        disabled={isRecurring}
                        className="mr-2 rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
                      />
                      <span className="text-sm text-gray-700">
                        Save card for future payments
                        {isRecurring && ' (required for recurring subscription)'}
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700">
            Notes (Optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e: any) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]"
            placeholder="Additional notes about this payment..."
          />
        </div>

        {/* Summary */}
        <div className="space-y-2 rounded-lg bg-gray-50 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Patient:</span>
            <span className="font-medium">{patientName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Amount:</span>
            <span className="font-medium text-[#4fa77e]">${amount.toFixed(2)}</span>
          </div>
          {isRecurring && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Billing:</span>
              <span className="font-medium text-amber-600">
                {(() => {
                  const plan = getPlanById(selectedPlanId, clinicSubdomain);
                  const m = plan?.months || 1;
                  return m === 1 ? 'Monthly Recurring' : `Every ${m} Months Recurring`;
                })()}
              </span>
            </div>
          )}
          {paymentMode === 'saved' && selectedCardId && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Card:</span>
              <span className="font-medium">
                {(() => {
                  const card = savedCards.find((c) => c.id === selectedCardId);
                  return card ? `•••• ${card.last4}` : 'Saved card';
                })()}
              </span>
            </div>
          )}
          {paymentMode === 'new' && saveCard && !isRecurring && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Card:</span>
              <span className="font-medium">Will be saved</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#4fa77e] px-6 py-2 text-white transition-colors hover:bg-[#3f8660] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Processing...' : isRecurring ? 'Start Subscription' : 'Process Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}
