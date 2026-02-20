'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getGroupedPlans,
  formatPlanPrice,
  getPlanById,
} from '@/config/billingPlans';
import {
  formatCardNumber,
  validateCardNumber,
  validateExpiryDate,
  validateCVV,
  getCardBrand,
} from '@/lib/encryption';
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
  const [description, setDescription] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState(false);

  // Payment method selection
  const [paymentMode, setPaymentMode] = useState<'saved' | 'new'>('new');
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | number | null>(null);
  const [loadingCards, setLoadingCards] = useState(true);

  // Credit card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [saveCard, setSaveCard] = useState(true);
  const [cardBrand, setCardBrand] = useState('');

  // Other states
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<{ [key: string]: string }>({});
  const [formSubmitted, setFormSubmitted] = useState(false);
  const groupedPlans = getGroupedPlans(clinicSubdomain);

  // Stripe.js confirmation flow for local-only cards
  const [stripeConfirmation, setStripeConfirmation] = useState<{
    clientSecret: string;
    paymentIntentId: string;
    localPaymentMethodId: number;
    stripePublishableKey?: string;
    stripeConnectedAccountId?: string | null;
  } | null>(null);
  const stripeCardRef = useRef<HTMLDivElement>(null);
  const stripeElementRef = useRef<StripeCardElement | null>(null);
  const stripeInstanceRef = useRef<Stripe | null>(null);

  // Mount Stripe CardElement when confirmation is needed
  useEffect(() => {
    if (!stripeConfirmation || !stripeCardRef.current) return;

    let mounted = true;
    const mountCard = async () => {
      const stripeP = getStripeInstance(
        stripeConfirmation.stripePublishableKey,
        stripeConfirmation.stripeConnectedAccountId,
      );
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
      }
    };
    mountCard();

    return () => {
      mounted = false;
      stripeElementRef.current?.unmount();
      stripeElementRef.current = null;
    };
  }, [stripeConfirmation]);

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
        setAmount(plan.price / 100);
        setDescription(plan.description);
        setIsRecurring(!!plan.isRecurring);
        if (plan.isRecurring) setSaveCard(true);
      }
    } else {
      setAmount(0);
      setDescription('');
      setIsRecurring(false);
    }
  }, [selectedPlanId]);

  const handleCardNumberChange = (value: string) => {
    const formatted = formatCardNumber(value);
    setCardNumber(formatted);

    // Detect card brand
    const brand = getCardBrand(value);
    setCardBrand(brand);

    // Validate card number
    if (value.replace(/\s/g, '').length >= 13) {
      if (!validateCardNumber(value)) {
        setCardErrors({ ...cardErrors, cardNumber: 'Invalid card number' });
      } else {
        const newErrors = { ...cardErrors };
        delete newErrors.cardNumber;
        setCardErrors(newErrors);
      }
    }
  };

  const handleExpiryMonthChange = (value: string) => {
    setExpiryMonth(value);
    if (value && expiryYear) {
      if (!validateExpiryDate(value, expiryYear)) {
        setCardErrors({ ...cardErrors, expiry: 'Card has expired or invalid date' });
      } else {
        const newErrors = { ...cardErrors };
        delete newErrors.expiry;
        setCardErrors(newErrors);
      }
    }
  };

  const handleExpiryYearChange = (value: string) => {
    setExpiryYear(value);
    if (expiryMonth && value) {
      if (!validateExpiryDate(expiryMonth, value)) {
        setCardErrors({ ...cardErrors, expiry: 'Card has expired or invalid date' });
      } else {
        const newErrors = { ...cardErrors };
        delete newErrors.expiry;
        setCardErrors(newErrors);
      }
    }
  };

  const handleCVVChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    setCvv(cleaned);

    if (cleaned.length >= 3) {
      if (!validateCVV(cleaned, cardBrand)) {
        setCardErrors({ ...cardErrors, cvv: 'Invalid CVV' });
      } else {
        const newErrors = { ...cardErrors };
        delete newErrors.cvv;
        setCardErrors(newErrors);
      }
    }
  };

  const handleAmountChange = (value: string) => {
    const parsed = parseFloat(value);
    setAmount(isNaN(parsed) ? 0 : parsed);
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
    } else {
      if (!cardNumber || cardNumber.trim().length === 0) {
        errors.cardNumber = 'Card number is required';
      } else if (!validateCardNumber(cardNumber)) {
        errors.cardNumber = 'Invalid card number';
      }

      if (!cardholderName || cardholderName.trim().length === 0) {
        errors.cardholderName = 'Cardholder name is required';
      }

      if (!expiryMonth || !expiryYear) {
        errors.expiry = 'Expiry date is required';
      } else if (!validateExpiryDate(expiryMonth, expiryYear)) {
        errors.expiry = 'Card has expired or invalid date';
      }

      if (!cvv || cvv.trim().length === 0) {
        errors.cvv = 'CVV is required';
      } else if (!validateCVV(cvv, cardBrand)) {
        errors.cvv = 'Invalid CVV';
      }

      if (!billingZip || billingZip.trim().length === 0) {
        errors.billingZip = 'Billing ZIP code is required';
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
      };

      if (paymentMode === 'saved' && selectedCardId) {
        payload.paymentMethodId = selectedCardId;
      } else {
        payload.paymentDetails = {
          cardNumber: cardNumber.replace(/\s/g, ''),
          cardholderName,
          expiryMonth: parseInt(expiryMonth),
          expiryYear: parseInt(expiryYear),
          cvv,
          billingZip,
          cardBrand,
          saveCard,
        };
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

      // Backend says the card needs Stripe.js confirmation (local-only card)
      if (data.requiresStripeConfirmation) {
        setStripeConfirmation({
          clientSecret: data.clientSecret,
          paymentIntentId: data.paymentIntentId,
          localPaymentMethodId: data.localPaymentMethodId,
          stripePublishableKey: data.stripePublishableKey,
          stripeConnectedAccountId: data.stripeConnectedAccountId,
        });
        setSubmitting(false);
        return;
      }

      setSuccessMessage(
        isRecurring
          ? 'Payment processed and recurring subscription set up successfully!'
          : 'Payment processed successfully!'
      );

      // Reset form
      setSelectedPlanId('');
      setAmount(0);
      setDescription('');
      setCardNumber('');
      setCardholderName('');
      setExpiryMonth('');
      setExpiryYear('');
      setCvv('');
      setBillingZip('');
      setNotes('');
      setIsRecurring(false);
      setSaveCard(true);
      setCardBrand('');
      setCardErrors({});
      setFormSubmitted(false);

      // Notify parent and trigger refresh
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      // @ts-ignore

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStripeConfirm = async () => {
    if (!stripeConfirmation || !stripeInstanceRef.current || !stripeElementRef.current) return;
    setSubmitting(true);
    setError(null);

    try {
      const { error: stripeError, paymentIntent } = await stripeInstanceRef.current.confirmCardPayment(
        stripeConfirmation.clientSecret,
        { payment_method: { card: stripeElementRef.current } }
      );

      if (stripeError) {
        throw new Error(stripeError.message || 'Payment failed');
      }

      // Tell the backend to finalize
      const confirmRes = await apiFetch('/api/stripe/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: stripeConfirmation.paymentIntentId,
          stripePaymentMethodId: paymentIntent?.payment_method,
          localPaymentMethodId: stripeConfirmation.localPaymentMethodId,
        }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        throw new Error(confirmData.error || 'Failed to confirm payment');
      }

      setStripeConfirmation(null);
      setSuccessMessage(
        isRecurring
          ? 'Payment processed and recurring subscription set up successfully!'
          : 'Payment processed successfully!'
      );

      setTimeout(() => { onSuccess(); }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment confirmation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setSelectedPlanId('');
    setAmount(0);
    setDescription('');
    setCardNumber('');
    setCardholderName('');
    setExpiryMonth('');
    setExpiryYear('');
    setCvv('');
    setBillingZip('');
    setNotes('');
    setError(null);
    setSuccessMessage(null);
    setCardErrors({});
    setIsRecurring(false);
    setSaveCard(true);
    setCardBrand('');
    setFormSubmitted(false);
    setStripeConfirmation(null);
    if (savedCards.length > 0) {
      setPaymentMode('saved');
      const defaultCard = savedCards.find((c) => c.isDefault) || savedCards[0];
      setSelectedCardId(defaultCard.id);
    } else {
      setPaymentMode('new');
      setSelectedCardId(null);
    }
  };

  // Generate year options (current year + next 10 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear + i);

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

      {stripeConfirmation && (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">
              This card needs to be verified for secure payment processing.
              Please enter the card details below to complete the payment.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Card Details</label>
            <div ref={stripeCardRef} className="rounded border border-gray-300 p-3" />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setStripeConfirmation(null); setError(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStripeConfirm}
              disabled={submitting}
              className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Processing...' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className={`space-y-6 ${stripeConfirmation ? 'hidden' : ''}`}>
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
              type="number"
              id="amount"
              value={amount.toFixed(2)}
              onChange={(e: any) => handleAmountChange(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                formSubmitted && cardErrors.amount ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="0.00"
              required
              min="0.01"
              step="0.01"
              disabled={!!selectedPlanId}
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
              onChange={(e: any) => setDescription(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                formSubmitted && cardErrors.description ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Payment description"
              required
              disabled={!!selectedPlanId}
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

              {/* New Card Entry */}
              {paymentMode === 'new' && (
                <>
                  {/* Card Number */}
                  <div className="mb-4">
                    <label htmlFor="cardNumber" className="mb-1 block text-sm font-medium text-gray-700">
                      Card Number
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="cardNumber"
                        value={cardNumber}
                        onChange={(e: any) => handleCardNumberChange(e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                          formSubmitted && cardErrors.cardNumber ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        required
                      />
                      {cardBrand && (
                        <span className="absolute right-3 top-2.5 text-sm font-medium text-gray-600">
                          {cardBrand}
                        </span>
                      )}
                    </div>
                    {formSubmitted && cardErrors.cardNumber && (
                      <p className="mt-1 text-sm text-red-600">{cardErrors.cardNumber}</p>
                    )}
                  </div>

                  {/* Cardholder Name */}
                  <div className="mb-4">
                    <label
                      htmlFor="cardholderName"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      id="cardholderName"
                      value={cardholderName}
                      onChange={(e: any) => setCardholderName(e.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                        formSubmitted && cardErrors.cardholderName ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="John Doe"
                      required
                    />
                    {formSubmitted && cardErrors.cardholderName && (
                      <p className="mt-1 text-sm text-red-600">{cardErrors.cardholderName}</p>
                    )}
                  </div>

                  {/* Expiry Date, CVV, ZIP */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Expiry Date</label>
                      <div className="flex gap-2">
                        <select
                          value={expiryMonth}
                          onChange={(e: any) => handleExpiryMonthChange(e.target.value)}
                          className={`flex-1 rounded-lg border px-2 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                            formSubmitted && cardErrors.expiry ? 'border-red-500' : 'border-gray-300'
                          }`}
                          required
                        >
                          <option value="">MM</option>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((month: any) => (
                            <option key={month} value={month.toString().padStart(2, '0')}>
                              {month.toString().padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <select
                          value={expiryYear}
                          onChange={(e: any) => handleExpiryYearChange(e.target.value)}
                          className={`flex-1 rounded-lg border px-2 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                            formSubmitted && cardErrors.expiry ? 'border-red-500' : 'border-gray-300'
                          }`}
                          required
                        >
                          <option value="">YYYY</option>
                          {yearOptions.map((year: any) => (
                            <option key={year} value={year.toString()}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>
                      {formSubmitted && cardErrors.expiry && (
                        <p className="mt-1 text-sm text-red-600">{cardErrors.expiry}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="cvv" className="mb-1 block text-sm font-medium text-gray-700">
                        CVV
                      </label>
                      <input
                        type="text"
                        id="cvv"
                        value={cvv}
                        onChange={(e: any) => handleCVVChange(e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                          formSubmitted && cardErrors.cvv ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder={cardBrand === 'American Express' ? '1234' : '123'}
                        maxLength={cardBrand === 'American Express' ? 4 : 3}
                        required
                      />
                      {formSubmitted && cardErrors.cvv && (
                        <p className="mt-1 text-sm text-red-600">{cardErrors.cvv}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="billingZip" className="mb-1 block text-sm font-medium text-gray-700">
                        Billing ZIP
                      </label>
                      <input
                        type="text"
                        id="billingZip"
                        value={billingZip}
                        onChange={(e: any) => setBillingZip(e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] ${
                          formSubmitted && cardErrors.billingZip ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="12345"
                        required
                      />
                      {formSubmitted && cardErrors.billingZip && (
                        <p className="mt-1 text-sm text-red-600">{cardErrors.billingZip}</p>
                      )}
                    </div>
                  </div>

                  {/* Save Card Checkbox */}
                  <div className="mt-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={saveCard}
                        onChange={(e: any) => setSaveCard(e.target.checked)}
                        disabled={isRecurring}
                        className="mr-2 rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
                      />
                      <span className="text-sm text-gray-700">
                        Save card for future payments
                        {isRecurring && ' (required for recurring subscription)'}
                      </span>
                    </label>
                  </div>
                </>
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
