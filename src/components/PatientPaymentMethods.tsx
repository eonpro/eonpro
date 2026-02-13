'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
// Using inline SVG icons instead of lucide-react
import { formatCardNumber, validateCardNumber } from '@/lib/encryption';
import { Patient, Provider, Order } from '@/types/models';

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
  id: number;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  isDefault: boolean;
  createdAt: Date;
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

  // Form state
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch saved cards
  const fetchCards = async () => {
    try {
      const response = await fetch(`/api/payment-methods?patientId=${patientId}`);
      if (!response.ok) throw new Error('Failed to fetch cards');
      const data = await response.json();
      setCards(data.data || []);
    } catch (err: any) {
      // @ts-ignore

      logger.error('Failed to fetch payment methods:', err);
      setError('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, [patientId]);

  // Handle card number input with formatting
  const handleCardNumberChange = (value: string) => {
    // Remove non-digits
    const cleaned = value.replace(/\D/g, '');

    // Limit to 19 digits
    if (cleaned.length > 19) return;

    // Format with spaces
    let formatted = '';
    for (let i = 0; i < cleaned.length; i++) {
      if (i > 0 && i % 4 === 0) {
        formatted += ' ';
      }
      formatted += cleaned[i];
    }

    setCardNumber(formatted);
  };

  // Handle expiry month
  const handleExpiryMonthChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 2) return;

    const month = parseInt(cleaned);
    if (month > 12) return;

    setExpiryMonth(cleaned);
  };

  // Handle expiry year
  const handleExpiryYearChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 4) return;
    setExpiryYear(cleaned);
  };

  // Handle CVV
  const handleCvvChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 4) return;
    setCvv(cleaned);
  };

  // Add new card
  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Validate card number
    const cleanedCardNumber = cardNumber.replace(/\s/g, '');
    if (!validateCardNumber(cleanedCardNumber)) {
      setError('Invalid card number');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          cardNumber: cleanedCardNumber,
          expiryMonth: parseInt(expiryMonth),
          expiryYear: parseInt(expiryYear),
          cvv: cvv || undefined,
          cardholderName,
          billingZip,
          setAsDefault: setAsDefault || cards.length === 0,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add card');
      }

      // Refresh cards list
      await fetchCards();

      // Reset form
      setCardNumber('');
      setExpiryMonth('');
      setExpiryYear('');
      setCvv('');
      setCardholderName('');
      setBillingZip('');
      setSetAsDefault(false);
      setShowAddCard(false);

      setSuccessMessage('Payment method added successfully');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      // @ts-ignore

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
      const response = await fetch(`/api/payment-methods?id=${cardId}&patientId=${patientId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove card');
      }

      await fetchCards();
      setSuccessMessage('Payment method removed');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      // @ts-ignore

      setError('Failed to remove payment method');
    }
  };

  // Set default card
  const handleSetDefault = async (cardId: number) => {
    try {
      const response = await fetch('/api/payment-methods/default', {
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
    } catch (err: any) {
      // @ts-ignore

      setError('Failed to update default payment method');
    }
  };

  // Get card brand icon (SVG)
  const getCardIcon = (brand: string) => {
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
            {cards.map((card: any) => (
              <div
                key={card.id}
                className={`rounded-lg border p-4 ${
                  card.isDefault ? 'border-[#4fa77e] bg-green-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{getCardIcon(card.brand)}</span>
                    <div>
                      <div className="font-medium">
                        {card.brand} •••• {card.last4}
                        {card.isDefault && (
                          <span className="ml-2 rounded bg-[#4fa77e] px-2 py-0.5 text-xs text-white">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {card.cardholderName} • Expires {String(card.expiryMonth).padStart(2, '0')}/
                        {card.expiryYear}
                        {isExpired(card.expiryMonth, card.expiryYear) && (
                          <span className="ml-2 font-medium text-red-600">Expired</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!card.isDefault && (
                      <button
                        onClick={() => handleSetDefault(card.id)}
                        className="text-sm text-[#4fa77e] hover:underline"
                      >
                        Set as default
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveCard(card.id)}
                      className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                      title="Remove card"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Card Form */}
        {showAddCard && (
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-4 text-lg font-medium">Add New Payment Method</h3>
            <form onSubmit={handleAddCard} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Cardholder Name
                </label>
                <input
                  type="text"
                  value={cardholderName}
                  onChange={(e: any) => setCardholderName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Card Number</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e: any) => handleCardNumberChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder="4242 4242 4242 4242"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Expiry Month
                  </label>
                  <input
                    type="text"
                    value={expiryMonth}
                    onChange={(e: any) => handleExpiryMonthChange(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="MM"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Expiry Year
                  </label>
                  <input
                    type="text"
                    value={expiryYear}
                    onChange={(e: any) => handleExpiryYearChange(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="YYYY"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">CVV</label>
                  <input
                    type="text"
                    value={cvv}
                    onChange={(e: any) => handleCvvChange(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="123"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Billing ZIP Code
                </label>
                <input
                  type="text"
                  value={billingZip}
                  onChange={(e: any) => setBillingZip(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder="12345"
                  required
                />
              </div>

              {cards.length > 0 && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="setAsDefault"
                    checked={setAsDefault}
                    onChange={(e: any) => setSetAsDefault(e.target.checked)}
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
                    setCardNumber('');
                    setExpiryMonth('');
                    setExpiryYear('');
                    setCvv('');
                    setCardholderName('');
                    setBillingZip('');
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
              Card numbers are encrypted using AES-256-GCM encryption and stored securely. Only the
              last 4 digits are displayed. CVV codes are never stored after processing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
