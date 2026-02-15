'use client';

import { useState, useEffect } from 'react';
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
  const [formSubmitted, setFormSubmitted] = useState(false); // Track if form has been submitted
  const groupedPlans = getGroupedPlans(clinicSubdomain);

  useEffect(() => {
    if (selectedPlanId) {
      const plan = getPlanById(selectedPlanId, clinicSubdomain);
      if (plan) {
        setAmount(plan.price / 100); // Convert cents to dollars
        setDescription(plan.description);

        // Check if it's a monthly plan and set recurring
        const isMonthlyPlan = plan.category.includes('monthly');
        setIsRecurring(isMonthlyPlan);
        setSaveCard(true); // Always save card, required for recurring
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

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};

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
      const res = await apiFetch('/api/stripe/payments/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          amount: Math.round(amount * 100), // Convert to cents
          description: description || getPlanById(selectedPlanId, clinicSubdomain)?.description || 'Custom Payment',
          paymentDetails: {
            cardNumber: cardNumber.replace(/\s/g, ''),
            cardholderName,
            expiryMonth: parseInt(expiryMonth),
            expiryYear: parseInt(expiryYear),
            cvv,
            billingZip,
            cardBrand,
            saveCard,
          },
          subscription: isRecurring
            ? {
                planId: selectedPlanId,
                planName: getPlanById(selectedPlanId, clinicSubdomain)?.name || '',
                interval: 'month',
                intervalCount: 1,
              }
            : null,
          notes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to process payment');
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
    setFormSubmitted(false); // Reset form submission state
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
              ⚡ This will set up a recurring monthly subscription
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

        {/* Credit Card Information */}
        <div className="border-t pt-4">
          <h4 className="mb-4 text-lg font-medium text-gray-900">Credit Card Information</h4>

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
                disabled={isRecurring} // Always save for recurring
                className="mr-2 rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
              />
              <span className="text-sm text-gray-700">
                Save card for future payments
                {isRecurring && ' (required for recurring subscription)'}
              </span>
            </label>
          </div>
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
              <span className="font-medium text-amber-600">Monthly Recurring</span>
            </div>
          )}
          {saveCard && !isRecurring && (
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
