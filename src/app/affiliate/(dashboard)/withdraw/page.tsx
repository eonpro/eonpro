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
        const res = await fetch('/api/affiliate/withdraw');
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
  const isValidAmount = amountCents >= displayData.minWithdrawal && 
                        amountCents <= displayData.availableBalance;

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
      const res = await fetch('/api/affiliate/withdraw', {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  // No payout method
  if (!displayData.payoutMethod) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            <Link href="/affiliate" className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Withdraw</h1>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Add a payout method</h2>
          <p className="text-gray-500 mb-6">
            You need to add a bank account or PayPal to withdraw funds.
          </p>
          <Link
            href="/affiliate/account/payout-method"
            className="inline-block px-6 py-3 bg-gray-900 text-white font-medium rounded-xl
                     hover:bg-gray-800 transition-colors"
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
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            <Link href="/affiliate" className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Withdraw</h1>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Payout in progress</h2>
          <p className="text-gray-500 mb-4">
            You have a pending withdrawal of {formatCurrency(displayData.pendingPayout.amount)}.
            Please wait for it to complete before requesting another.
          </p>
          <Link
            href="/affiliate/earnings"
            className="text-gray-900 font-medium hover:underline"
          >
            View payout status
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button 
            onClick={() => step === 'confirm' ? setStep('amount') : router.back()}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Withdraw</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6">
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
              <div className="text-center py-4">
                <p className="text-gray-500 text-sm mb-1">Available balance</p>
                <p className="text-3xl font-semibold text-gray-900">
                  {formatCurrency(displayData.availableBalance)}
                </p>
              </div>

              {/* Amount Input */}
              <div className="bg-white rounded-2xl p-6">
                <label className="block text-sm text-gray-500 mb-3">Amount to withdraw</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0"
                    className="w-full pl-10 pr-4 py-4 text-3xl font-semibold text-center rounded-xl
                             border-2 border-gray-200 focus:border-gray-900 focus:ring-0 transition-colors"
                  />
                </div>

                {/* Quick amounts */}
                <div className="flex gap-2 mt-4">
                  {[2500, 5000, 10000].map((cents) => (
                    <button
                      key={cents}
                      onClick={() => handleQuickAmount(cents)}
                      disabled={cents > displayData.availableBalance}
                      className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200
                               hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {formatCurrency(cents)}
                    </button>
                  ))}
                  <button
                    onClick={() => handleQuickAmount(displayData.availableBalance)}
                    className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200
                             hover:bg-gray-50 transition-colors"
                  >
                    All
                  </button>
                </div>

                {error && (
                  <p className="mt-3 text-red-500 text-sm text-center">{error}</p>
                )}
              </div>

              {/* Payout Method */}
              <div className="bg-white rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
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
                  <Link href="/affiliate/account/payout-method" className="text-sm text-gray-500 hover:text-gray-700">
                    Change
                  </Link>
                </div>
              </div>

              {/* Continue Button */}
              <button
                onClick={handleContinue}
                disabled={!amount || parseFloat(amount) <= 0}
                className="w-full py-4 bg-gray-900 text-white font-medium rounded-xl
                         hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
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
              <div className="bg-white rounded-2xl p-6 text-center">
                <p className="text-gray-500 text-sm mb-2">You&apos;re withdrawing</p>
                <p className="text-4xl font-semibold text-gray-900 mb-6">
                  {formatCurrency(amountCents)}
                </p>

                <div className="bg-gray-50 rounded-xl p-4 text-left">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-500">To</span>
                    <span className="font-medium text-gray-900">
                      {displayData.payoutMethod?.type === 'bank'
                        ? `${displayData.payoutMethod.bankName} ••••${displayData.payoutMethod.last4}`
                        : displayData.payoutMethod?.email}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-500">Fee</span>
                    <span className="font-medium text-green-600">Free</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                    <span className="text-gray-500">You&apos;ll receive</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(amountCents)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-4 bg-gray-900 text-white font-medium rounded-xl
                         hover:bg-gray-800 disabled:bg-gray-400 transition-colors
                         flex items-center justify-center"
              >
                {isSubmitting ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Confirm Withdrawal'
                )}
              </button>

              <p className="text-center text-xs text-gray-400">
                By confirming, you agree to our withdrawal terms.
                Funds typically arrive within 2-3 business days.
              </p>
            </motion.div>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-12"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.5 }}
                className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
              >
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>

              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Withdrawal requested
              </h2>
              <p className="text-gray-500 mb-8">
                {formatCurrency(amountCents)} is on its way to your account.
                <br />
                Expected arrival: 2-3 business days.
              </p>

              <div className="space-y-3">
                <Link
                  href="/affiliate/earnings"
                  className="block w-full py-3 bg-gray-900 text-white font-medium rounded-xl
                           hover:bg-gray-800 transition-colors"
                >
                  View Payout Status
                </Link>
                <Link
                  href="/affiliate"
                  className="block w-full py-3 text-gray-600 font-medium hover:text-gray-900 transition-colors"
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
