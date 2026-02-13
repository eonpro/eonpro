'use client';

/**
 * Affiliate Payout Method Page
 *
 * Add/edit bank account or PayPal for payouts.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

type MethodType = 'bank' | 'paypal';

interface PayoutMethod {
  type: MethodType;
  last4?: string;
  bankName?: string;
  email?: string;
  isVerified: boolean;
}

export default function PayoutMethodPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentMethod, setCurrentMethod] = useState<PayoutMethod | null>(null);
  const [selectedType, setSelectedType] = useState<MethodType>('bank');
  const [isEditing, setIsEditing] = useState(false);

  // Bank form
  const [bankForm, setBankForm] = useState({
    accountHolderName: '',
    routingNumber: '',
    accountNumber: '',
    accountType: 'checking' as 'checking' | 'savings',
  });

  // PayPal form
  const [paypalEmail, setPaypalEmail] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/affiliate/account');
        if (res.ok) {
          const data = await res.json();
          if (data.payoutMethod) {
            setCurrentMethod(data.payoutMethod);
          } else {
            setIsEditing(true); // No method, go straight to add
          }
        }
      } catch (error) {
        console.error('Failed to fetch payout method:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const payload =
        selectedType === 'bank'
          ? { type: 'bank', ...bankForm }
          : { type: 'paypal', email: paypalEmail };

      const res = await fetch('/api/affiliate/account/payout-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/affiliate/account');
        }, 1500);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save payout method');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link href="/affiliate/account" className="text-gray-400 hover:text-gray-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Payout Method</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800"
          >
            Payout method saved successfully! Redirecting...
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {error}
          </motion.div>
        )}

        {/* Current Method (if exists and not editing) */}
        {currentMethod && !isEditing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Current Method</h2>
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  currentMethod.isVerified
                    ? 'bg-green-50 text-green-700'
                    : 'bg-yellow-50 text-yellow-700'
                }`}
              >
                {currentMethod.isVerified ? 'Verified' : 'Pending Verification'}
              </span>
            </div>

            <div className="mb-4 flex items-center gap-4 rounded-xl bg-gray-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                {currentMethod.type === 'bank' ? (
                  <svg
                    className="h-6 w-6 text-gray-600"
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
                ) : (
                  <svg className="h-6 w-6 text-[#cab172]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {currentMethod.type === 'bank'
                    ? `${currentMethod.bankName || 'Bank Account'} ••••${currentMethod.last4}`
                    : currentMethod.email}
                </p>
                <p className="text-sm capitalize text-gray-500">
                  {currentMethod.type === 'bank' ? 'Bank Transfer' : 'PayPal'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsEditing(true)}
              className="w-full rounded-xl border border-gray-200 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Change Payout Method
            </button>
          </motion.div>
        )}

        {/* Add/Edit Form */}
        {isEditing && (
          <form onSubmit={handleSubmit}>
            {/* Method Type Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-2xl bg-white p-6"
            >
              <h2 className="mb-4 font-semibold text-gray-900">Select Method</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedType('bank')}
                  className={`rounded-xl border-2 p-4 transition-all ${
                    selectedType === 'bank'
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <svg
                    className="mx-auto mb-2 h-8 w-8 text-gray-600"
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
                  <p className="font-medium text-gray-900">Bank Account</p>
                  <p className="mt-1 text-xs text-gray-500">2-3 business days</p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedType('paypal')}
                  className={`rounded-xl border-2 p-4 transition-all ${
                    selectedType === 'paypal'
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <svg
                    className="mx-auto mb-2 h-8 w-8 text-[#cab172]"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
                  </svg>
                  <p className="font-medium text-gray-900">PayPal</p>
                  <p className="mt-1 text-xs text-gray-500">Instant transfer</p>
                </button>
              </div>
            </motion.div>

            {/* Bank Form */}
            <AnimatePresence mode="wait">
              {selectedType === 'bank' && (
                <motion.div
                  key="bank"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4 rounded-2xl bg-white p-6"
                >
                  <h2 className="font-semibold text-gray-900">Bank Account Details</h2>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={bankForm.accountHolderName}
                      onChange={(e) =>
                        setBankForm({ ...bankForm, accountHolderName: e.target.value })
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Routing Number
                    </label>
                    <input
                      type="text"
                      value={bankForm.routingNumber}
                      onChange={(e) =>
                        setBankForm({
                          ...bankForm,
                          routingNumber: e.target.value.replace(/\D/g, '').slice(0, 9),
                        })
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      placeholder="123456789"
                      maxLength={9}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={bankForm.accountNumber}
                      onChange={(e) =>
                        setBankForm({
                          ...bankForm,
                          accountNumber: e.target.value.replace(/\D/g, ''),
                        })
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      placeholder="••••••••••••"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Account Type
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setBankForm({ ...bankForm, accountType: 'checking' })}
                        className={`flex-1 rounded-xl border py-3 transition-all ${
                          bankForm.accountType === 'checking'
                            ? 'border-gray-900 bg-gray-50 font-medium'
                            : 'border-gray-200'
                        }`}
                      >
                        Checking
                      </button>
                      <button
                        type="button"
                        onClick={() => setBankForm({ ...bankForm, accountType: 'savings' })}
                        className={`flex-1 rounded-xl border py-3 transition-all ${
                          bankForm.accountType === 'savings'
                            ? 'border-gray-900 bg-gray-50 font-medium'
                            : 'border-gray-200'
                        }`}
                      >
                        Savings
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#fdf6e3] p-4 text-sm text-[#6b5c2e]">
                    <p className="mb-1 font-medium">Your information is secure</p>
                    <p className="text-[#8b7a42]">
                      Bank details are encrypted and stored securely. We use bank-level security.
                    </p>
                  </div>
                </motion.div>
              )}

              {selectedType === 'paypal' && (
                <motion.div
                  key="paypal"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4 rounded-2xl bg-white p-6"
                >
                  <h2 className="font-semibold text-gray-900">PayPal Details</h2>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      PayPal Email
                    </label>
                    <input
                      type="email"
                      value={paypalEmail}
                      onChange={(e) => setPaypalEmail(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      placeholder="your@email.com"
                      required
                    />
                    <p className="mt-2 text-sm text-gray-500">
                      Enter the email address associated with your PayPal account
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#fdf6e3] p-4 text-sm text-[#6b5c2e]">
                    <p className="mb-1 font-medium">Instant Payouts</p>
                    <p className="text-[#8b7a42]">
                      PayPal payouts are typically processed instantly once approved.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="mt-6 flex gap-3">
              {currentMethod && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 rounded-xl border border-gray-200 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="flex flex-1 items-center justify-center rounded-xl bg-gray-900 py-3 font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-400"
              >
                {isSaving ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  'Save Payout Method'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
