'use client';

/**
 * Affiliate Tax Information Page
 *
 * W-9 submission and tax document management.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface TaxStatus {
  hasValidW9: boolean;
  yearToDateEarnings: number;
  threshold: number;
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

export default function TaxInfoPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [taxStatus, setTaxStatus] = useState<TaxStatus | null>(null);
  const [showW9Form, setShowW9Form] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // W-9 Form fields
  const [w9Form, setW9Form] = useState({
    legalName: '',
    businessName: '',
    taxClassification: 'individual' as
      | 'individual'
      | 'llc'
      | 'corporation'
      | 'partnership'
      | 'other',
    taxId: '',
    taxIdType: 'ssn' as 'ssn' | 'ein',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    certify: false,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/affiliate/account');
        if (res.ok) {
          const data = await res.json();
          setTaxStatus(data.taxStatus);
        }
      } catch (error) {
        console.error('Failed to fetch tax status:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmitW9 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!w9Form.certify) {
      setError('You must certify that the information is correct');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/affiliate/account/tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(w9Form),
      });

      if (res.ok) {
        setSuccess(true);
        setShowW9Form(false);
        setTaxStatus((prev) => (prev ? { ...prev, hasValidW9: true } : null));
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit W-9');
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

  const needsW9 = taxStatus && taxStatus.yearToDateEarnings >= taxStatus.threshold;

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
          <h1 className="text-xl font-semibold text-gray-900">Tax Information</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800"
          >
            W-9 submitted successfully! We&apos;ll review it within 1-2 business days.
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {error}
          </motion.div>
        )}

        {/* Earnings Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white p-6"
        >
          <h2 className="mb-4 font-semibold text-gray-900">Tax Year Summary</h2>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="mb-1 text-sm text-gray-500">Year-to-Date Earnings</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(taxStatus?.yearToDateEarnings || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="mb-1 text-sm text-gray-500">1099 Threshold</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(taxStatus?.threshold || 60000)}
              </p>
            </div>
          </div>

          {needsW9 && !taxStatus?.hasValidW9 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="font-medium text-yellow-800">W-9 Required</p>
                  <p className="mt-1 text-sm text-yellow-700">
                    You&apos;ve earned over $600 this year. Please submit a W-9 form for tax
                    purposes.
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* W-9 Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">W-9 Form</h2>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                taxStatus?.hasValidW9
                  ? 'bg-green-50 text-green-700'
                  : 'bg-yellow-50 text-yellow-700'
              }`}
            >
              {taxStatus?.hasValidW9 ? 'On File' : 'Required'}
            </span>
          </div>

          {taxStatus?.hasValidW9 ? (
            <div className="flex items-center gap-4 rounded-xl bg-green-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-green-900">W-9 on file</p>
                <p className="text-sm text-green-700">Your tax information is up to date</p>
              </div>
            </div>
          ) : (
            <>
              {!showW9Form ? (
                <button
                  onClick={() => setShowW9Form(true)}
                  className="w-full rounded-xl bg-gray-900 py-3 font-medium text-white transition-colors hover:bg-gray-800"
                >
                  Submit W-9 Form
                </button>
              ) : (
                <form onSubmit={handleSubmitW9} className="space-y-4">
                  {/* Legal Name */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Legal Name (as shown on tax return)
                    </label>
                    <input
                      type="text"
                      value={w9Form.legalName}
                      onChange={(e) => setW9Form({ ...w9Form, legalName: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      required
                    />
                  </div>

                  {/* Business Name */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Business Name (if different)
                    </label>
                    <input
                      type="text"
                      value={w9Form.businessName}
                      onChange={(e) => setW9Form({ ...w9Form, businessName: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                    />
                  </div>

                  {/* Tax Classification */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Tax Classification
                    </label>
                    <select
                      value={w9Form.taxClassification}
                      onChange={(e) =>
                        setW9Form({
                          ...w9Form,
                          taxClassification: e.target.value as typeof w9Form.taxClassification,
                        })
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                    >
                      <option value="individual">Individual/Sole Proprietor</option>
                      <option value="llc">LLC</option>
                      <option value="corporation">Corporation</option>
                      <option value="partnership">Partnership</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Tax ID */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Tax Identification Number
                    </label>
                    <div className="mb-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => setW9Form({ ...w9Form, taxIdType: 'ssn' })}
                        className={`flex-1 rounded-lg border py-2 text-sm ${
                          w9Form.taxIdType === 'ssn'
                            ? 'border-gray-900 bg-gray-50 font-medium'
                            : 'border-gray-200'
                        }`}
                      >
                        SSN
                      </button>
                      <button
                        type="button"
                        onClick={() => setW9Form({ ...w9Form, taxIdType: 'ein' })}
                        className={`flex-1 rounded-lg border py-2 text-sm ${
                          w9Form.taxIdType === 'ein'
                            ? 'border-gray-900 bg-gray-50 font-medium'
                            : 'border-gray-200'
                        }`}
                      >
                        EIN
                      </button>
                    </div>
                    <input
                      type="text"
                      value={w9Form.taxId}
                      onChange={(e) =>
                        setW9Form({
                          ...w9Form,
                          taxId: e.target.value.replace(/\D/g, '').slice(0, 9),
                        })
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      placeholder={w9Form.taxIdType === 'ssn' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'}
                      maxLength={9}
                      required
                    />
                  </div>

                  {/* Address */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Address</label>
                    <input
                      type="text"
                      value={w9Form.address}
                      onChange={(e) => setW9Form({ ...w9Form, address: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      placeholder="Street address"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={w9Form.city}
                      onChange={(e) => setW9Form({ ...w9Form, city: e.target.value })}
                      className="rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      placeholder="City"
                      required
                    />
                    <input
                      type="text"
                      value={w9Form.state}
                      onChange={(e) =>
                        setW9Form({ ...w9Form, state: e.target.value.toUpperCase().slice(0, 2) })
                      }
                      className="rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      placeholder="State"
                      maxLength={2}
                      required
                    />
                    <input
                      type="text"
                      value={w9Form.zipCode}
                      onChange={(e) =>
                        setW9Form({
                          ...w9Form,
                          zipCode: e.target.value.replace(/\D/g, '').slice(0, 5),
                        })
                      }
                      className="rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:ring-0"
                      placeholder="ZIP"
                      maxLength={5}
                      required
                    />
                  </div>

                  {/* Certification */}
                  <div className="rounded-xl bg-gray-50 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={w9Form.certify}
                        onChange={(e) => setW9Form({ ...w9Form, certify: e.target.checked })}
                        className="mt-0.5 h-5 w-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                      <span className="text-sm text-gray-600">
                        Under penalties of perjury, I certify that the number shown on this form is
                        my correct taxpayer identification number, and I am not subject to backup
                        withholding.
                      </span>
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowW9Form(false)}
                      className="flex-1 rounded-xl border border-gray-200 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving || !w9Form.certify}
                      className="flex flex-1 items-center justify-center rounded-xl bg-gray-900 py-3 font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-400"
                    >
                      {isSaving ? (
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        'Submit W-9'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </motion.div>

        {/* Tax Documents */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white p-6"
        >
          <h2 className="mb-4 font-semibold text-gray-900">Tax Documents</h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
              <div className="flex items-center gap-3">
                <svg
                  className="h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div>
                  <p className="font-medium text-gray-900">1099-NEC (2025)</p>
                  <p className="text-sm text-gray-500">Available January 2026</p>
                </div>
              </div>
              <span className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-600">
                Coming Soon
              </span>
            </div>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Tax documents will be available for download in January each year for the previous tax
            year.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
