'use client';

/**
 * Affiliate Withdraw Page
 *
 * Clean, simple withdrawal experience with instant feedback.
 * Supports bank transfer and PayPal.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/fetch';

interface WithdrawData {
  availableBalance: number;
  minWithdrawal: number;
  payoutMethod: {
    type: 'bank' | 'paypal';
    last4?: string;
    bankName?: string;
    email?: string;
  } | null;
  pendingPayout: {
    amount: number;
    createdAt: string;
    status: string;
  } | null;
}

type Step = 'amount' | 'confirm' | 'success';

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

export default function WithdrawPage() {
  const router = useRouter();
  const [data, setData] = useState<WithdrawData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiFetch('/api/affiliate/withdraw');
        if (res.ok) {
          const withdrawData = await res.json();
          setData(withdrawData);
        }
      } catch (error) {
        console.error('Failed to fetch withdraw data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Use real data or empty state
  const displayData: WithdrawData = data || {
    availableBalance: 0,
    minWithdrawal: 5000,
    payoutMethod: null,
    pendingPayout: null,
  };

  const amountCents = Math.round(parseFloat(amount || '0') * 100);
  const isValidAmount =
    amountCents >= displayData.minWithdrawal && amountCents <= displayData.availableBalance;

  const handleAmountChange = (value: string) => {
    // Only allow numbers and one decimal point
    const cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return;
    if (parts[1]?.length > 2) return;
    setAmount(cleaned);
    setError(null);
  };

  const handleQuickAmount = (cents: number) => {
    setAmount((cents / 100).toString());
    setError(null);
  };

  const handleContinue = () => {
    if (!isValidAmount) {
      if (amountCents < displayData.minWithdrawal) {
        setError(`Minimum withdrawal is ${formatCurrency(displayData.minWithdrawal)}`);
      } else {
        setError('Amount exceeds available balance');
      }
      return;
    }
    setStep('confirm');
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch('/api/affiliate/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents }),
      });

      if (res.ok) {
        setStep('success');
      } else {
        const data = await res.json();
        setError(data.error || 'Withdrawal failed');
        setStep('amount');
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setStep('amount');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  // No payout method
  if (!displayData.payoutMethod) {
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-4">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <Link href="/affiliate" className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Withdraw</h1>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg
              className="h-8 w-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Add a payout method</h2>
          <p className="mb-6 text-gray-500">
            You need to add a bank account or PayPal to withdraw funds.
          </p>
          <Link
            href="/affiliate/account/payout-method"
            className="inline-block rounded-xl px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Add Payout Method
          </Link>
        </div>
      </div>
    );
  }

  // Pending payout
  if (displayData.pendingPayout) {
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-4">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <Link href="/affiliate" className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Withdraw</h1>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
            <svg
              className="h-8 w-8 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Payout in progress</h2>
          <p className="mb-4 text-gray-500">
            You have a pending withdrawal of {formatCurrency(displayData.pendingPayout.amount)}.
            Please wait for it to complete before requesting another.
          </p>
          <Link href="/affiliate/earnings" className="font-medium text-gray-900 hover:underline">
            View payout status
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <button
            onClick={() => (step === 'confirm' ? setStep('amount') : router.back())}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Withdraw</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        <AnimatePresence mode="wait">
          {/* Amount Step */}
          {step === 'amount' && (
            <motion.div
              key="amount"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Available Balance */}
              <div className="py-4 text-center">
                <p className="mb-1 text-sm text-gray-500">Available balance</p>
                <p className="text-3xl font-semibold text-gray-900">
                  {formatCurrency(displayData.availableBalance)}
                </p>
              </div>

              {/* Amount Input */}
              <div className="rounded-2xl bg-white p-6">
                <label className="mb-3 block text-sm text-gray-500">Amount to withdraw</label>
                <div className="relative">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400 transition-opacity duration-200 ${amount ? 'opacity-0' : 'opacity-100'}`}>
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border-2 border-gray-200 py-4 pl-10 pr-4 text-center text-3xl font-semibold transition-colors focus:border-gray-900 focus:ring-0"
                  />
                </div>

                {/* Quick amounts */}
                <div className="mt-4 flex gap-2">
                  {[2500, 5000, 10000].map((cents) => (
                    <button
                      key={cents}
                      onClick={() => handleQuickAmount(cents)}
                      disabled={cents > displayData.availableBalance}
                      className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {formatCurrency(cents)}
                    </button>
                  ))}
                  <button
                    onClick={() => handleQuickAmount(displayData.availableBalance)}
                    className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
                  >
                    All
                  </button>
                </div>

                {error && <p className="mt-3 text-center text-sm text-red-500">{error}</p>}
              </div>

              {/* Payout Method */}
              <div className="rounded-2xl bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                      <svg
                        className="h-5 w-5 text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {displayData.payoutMethod.type === 'bank'
                          ? `${displayData.payoutMethod.bankName} ••••${displayData.payoutMethod.last4}`
                          : displayData.payoutMethod.email}
                      </p>
                      <p className="text-sm text-gray-500">
                        {displayData.payoutMethod.type === 'bank' ? 'Bank Transfer' : 'PayPal'}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/affiliate/account/payout-method"
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Change
                  </Link>
                </div>
              </div>

              {/* Continue Button */}
              <button
                onClick={handleContinue}
                disabled={!amount || parseFloat(amount) <= 0}
                className="w-full rounded-xl py-4 font-medium text-white transition-opacity hover:opacity-90 disabled:bg-gray-200 disabled:text-gray-400"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Continue
              </button>

              <p className="text-center text-sm text-gray-400">
                Min. {formatCurrency(displayData.minWithdrawal)} · Arrives in 2-3 business days
              </p>
            </motion.div>
          )}

          {/* Confirm Step */}
          {step === 'confirm' && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="rounded-2xl bg-white p-6 text-center">
                <p className="mb-2 text-sm text-gray-500">You&apos;re withdrawing</p>
                <p className="mb-6 text-4xl font-semibold text-gray-900">
                  {formatCurrency(amountCents)}
                </p>

                <div className="rounded-xl bg-gray-50 p-4 text-left">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-gray-500">To</span>
                    <span className="font-medium text-gray-900">
                      {displayData.payoutMethod?.type === 'bank'
                        ? `${displayData.payoutMethod.bankName} ••••${displayData.payoutMethod.last4}`
                        : displayData.payoutMethod?.email}
                    </span>
                  </div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-gray-500">Fee</span>
                    <span className="font-medium text-green-600">Free</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                    <span className="text-gray-500">You&apos;ll receive</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(amountCents)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex w-full items-center justify-center rounded-xl py-4 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {isSubmitting ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  'Confirm Withdrawal'
                )}
              </button>

              <p className="text-center text-xs text-gray-400">
                By confirming, you agree to our withdrawal terms. Funds typically arrive within 2-3
                business days.
              </p>
            </motion.div>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-12 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.5 }}
                className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100"
              >
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
              </motion.div>

              <h2 className="mb-2 text-2xl font-semibold text-gray-900">Withdrawal requested</h2>
              <p className="mb-8 text-gray-500">
                {formatCurrency(amountCents)} is on its way to your account.
                <br />
                Expected arrival: 2-3 business days.
              </p>

              <div className="space-y-3">
                <Link
                  href="/affiliate/earnings"
                  className="block w-full rounded-xl py-3 font-medium text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  View Payout Status
                </Link>
                <Link
                  href="/affiliate"
                  className="block w-full py-3 font-medium text-gray-600 transition-colors hover:text-gray-900"
                >
                  Back to Dashboard
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
