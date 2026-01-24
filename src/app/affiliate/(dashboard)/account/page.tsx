'use client';

/**
 * Affiliate Account Page
 * 
 * Profile settings, payout methods, and preferences.
 * Clean, organized settings with clear actions.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AccountData {
  profile: {
    displayName: string;
    email: string;
    phone: string;
    tier: string;
    joinedAt: string;
    avatarUrl?: string;
  };
  payoutMethod: {
    type: 'bank' | 'paypal' | 'none';
    last4?: string;
    bankName?: string;
    email?: string;
  } | null;
  preferences: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    weeklyReport: boolean;
  };
  taxStatus: {
    hasValidW9: boolean;
    yearToDateEarnings: number;
    threshold: number;
  };
}

export default function AccountPage() {
  const router = useRouter();
  const [data, setData] = useState<AccountData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const res = await fetch('/api/affiliate/account');
        if (res.ok) {
          const accountData = await res.json();
          setData(accountData);
        }
      } catch (error) {
        console.error('Failed to fetch account:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAccount();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/affiliate/auth/logout', { method: 'POST' });
      router.push('/affiliate/login');
    } catch {
      setIsLoggingOut(false);
    }
  };

  // Mock data for development
  const displayData: AccountData = data || {
    profile: {
      displayName: 'Sarah Johnson',
      email: 'sarah@example.com',
      phone: '+1 (555) 123-4567',
      tier: 'Gold Partner',
      joinedAt: '2024-03-15',
    },
    payoutMethod: {
      type: 'bank',
      last4: '4567',
      bankName: 'Chase Bank',
    },
    preferences: {
      emailNotifications: true,
      smsNotifications: false,
      weeklyReport: true,
    },
    taxStatus: {
      hasValidW9: true,
      yearToDateEarnings: 850000,
      threshold: 60000,
    },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">Account</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center">
              {displayData.profile.avatarUrl ? (
                <img 
                  src={displayData.profile.avatarUrl} 
                  alt={displayData.profile.displayName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-2xl font-semibold text-white">
                  {displayData.profile.displayName.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{displayData.profile.displayName}</h2>
              <span className="inline-block px-2 py-0.5 bg-yellow-50 text-yellow-700 text-xs font-medium rounded-full mt-1">
                {displayData.profile.tier}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">Phone</span>
              <span className="text-gray-900">{displayData.profile.phone}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-900">{displayData.profile.email}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-gray-500">Member since</span>
              <span className="text-gray-900">
                {new Date(displayData.profile.joinedAt).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            </div>
          </div>

          <Link
            href="/affiliate/account/edit"
            className="mt-4 block w-full py-3 border border-gray-200 text-gray-900 font-medium rounded-xl text-center
                     hover:bg-gray-50 transition-colors"
          >
            Edit Profile
          </Link>
        </motion.div>

        {/* Payout Method */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Payout Method</h3>
            <Link 
              href="/affiliate/account/payout-method"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {displayData.payoutMethod ? 'Change' : 'Add'}
            </Link>
          </div>

          {displayData.payoutMethod && displayData.payoutMethod.type !== 'none' ? (
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                {displayData.payoutMethod.type === 'bank' ? (
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {displayData.payoutMethod.type === 'bank' 
                    ? `${displayData.payoutMethod.bankName} ••••${displayData.payoutMethod.last4}`
                    : displayData.payoutMethod.email
                  }
                </p>
                <p className="text-sm text-gray-500 capitalize">
                  {displayData.payoutMethod.type === 'bank' ? 'Bank Account' : 'PayPal'}
                </p>
              </div>
            </div>
          ) : (
            <Link
              href="/affiliate/account/payout-method"
              className="flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 rounded-xl
                       hover:border-gray-300 transition-colors"
            >
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Add payout method</p>
                <p className="text-sm text-gray-500">Required to receive payouts</p>
              </div>
            </Link>
          )}
        </motion.div>

        {/* Tax Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Tax Information</h3>
            <Link 
              href="/affiliate/account/tax"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Manage
            </Link>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">W-9 Status</span>
              <span className={`flex items-center gap-1.5 ${displayData.taxStatus.hasValidW9 ? 'text-green-600' : 'text-yellow-600'}`}>
                {displayData.taxStatus.hasValidW9 ? (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    On file
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Required
                  </>
                )}
              </span>
            </div>
            
            {displayData.taxStatus.yearToDateEarnings >= displayData.taxStatus.threshold && (
              <div className="p-3 bg-yellow-50 rounded-xl text-sm text-yellow-800">
                <p className="font-medium">1099 eligible</p>
                <p className="text-yellow-700 mt-1">
                  You&apos;ve earned over $600 this year. A 1099 will be issued.
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Notifications */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-6"
        >
          <h3 className="font-semibold text-gray-900 mb-4">Notifications</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-gray-900">Email notifications</p>
                <p className="text-sm text-gray-500">Earnings and payout updates</p>
              </div>
              <button
                className={`w-12 h-7 rounded-full relative transition-colors ${
                  displayData.preferences.emailNotifications ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                    displayData.preferences.emailNotifications ? 'left-5.5 translate-x-0' : 'left-0.5'
                  }`}
                  style={{
                    transform: displayData.preferences.emailNotifications ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-gray-900">SMS notifications</p>
                <p className="text-sm text-gray-500">Important alerts via text</p>
              </div>
              <button
                className={`w-12 h-7 rounded-full relative transition-colors ${
                  displayData.preferences.smsNotifications ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform`}
                  style={{
                    transform: displayData.preferences.smsNotifications ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-gray-900">Weekly report</p>
                <p className="text-sm text-gray-500">Performance summary every Monday</p>
              </div>
              <button
                className={`w-12 h-7 rounded-full relative transition-colors ${
                  displayData.preferences.weeklyReport ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform`}
                  style={{
                    transform: displayData.preferences.weeklyReport ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Help & Legal */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl divide-y divide-gray-100"
        >
          <Link
            href="/affiliate/help"
            className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <span className="text-gray-900">Help Center</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/affiliate/terms"
            className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <span className="text-gray-900">Partner Agreement</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/privacy"
            className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <span className="text-gray-900">Privacy Policy</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>

        {/* Logout */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full py-4 text-red-600 font-medium hover:bg-red-50 rounded-2xl transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoggingOut ? 'Signing out...' : 'Sign Out'}
        </motion.button>

        {/* Version */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Version 1.0.0
        </p>
      </div>
    </div>
  );
}
