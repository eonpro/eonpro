'use client';

/**
 * Affiliate Account Page
 *
 * Profile settings, payout methods, and preferences.
 * Clean, organized settings with clear actions.
 */

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api/fetch';
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
  leaderboard: {
    optIn: boolean;
    alias: string | null;
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
        const res = await apiFetch('/api/affiliate/account');
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
      window.location.href = '/affiliate/login';
    } catch {
      setIsLoggingOut(false);
    }
  };

  // Use real data or empty state
  const displayData: AccountData = data || {
    profile: {
      displayName: 'Partner',
      email: '',
      phone: '',
      tier: 'Standard',
      joinedAt: new Date().toISOString(),
    },
    payoutMethod: null,
    preferences: {
      emailNotifications: true,
      smsNotifications: false,
      weeklyReport: true,
    },
    leaderboard: {
      optIn: false,
      alias: null,
    },
    taxStatus: {
      hasValidW9: false,
      yearToDateEarnings: 0,
      threshold: 60000,
    },
  };

  // Leaderboard settings state
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(displayData.leaderboard.optIn);
  const [leaderboardAlias, setLeaderboardAlias] = useState(displayData.leaderboard.alias || '');
  const [isSavingLeaderboard, setIsSavingLeaderboard] = useState(false);

  // Notification preferences state
  const [emailNotifications, setEmailNotifications] = useState(
    displayData.preferences.emailNotifications
  );
  const [smsNotifications, setSmsNotifications] = useState(
    displayData.preferences.smsNotifications
  );
  const [weeklyReport, setWeeklyReport] = useState(displayData.preferences.weeklyReport);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // Update state when data loads
  useEffect(() => {
    if (data) {
      setLeaderboardOptIn(data.leaderboard.optIn);
      setLeaderboardAlias(data.leaderboard.alias || '');
      setEmailNotifications(data.preferences.emailNotifications);
      setSmsNotifications(data.preferences.smsNotifications);
      setWeeklyReport(data.preferences.weeklyReport);
    }
  }, [data]);

  // Handle notification preference toggles
  const handlePreferenceToggle = async (
    preference: 'emailNotifications' | 'smsNotifications' | 'weeklyReport'
  ) => {
    setIsSavingPreferences(true);
    const newValue =
      preference === 'emailNotifications'
        ? !emailNotifications
        : preference === 'smsNotifications'
          ? !smsNotifications
          : !weeklyReport;

    try {
      const res = await apiFetch('/api/affiliate/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [preference]: newValue }),
      });

      if (res.ok) {
        if (preference === 'emailNotifications') setEmailNotifications(newValue);
        else if (preference === 'smsNotifications') setSmsNotifications(newValue);
        else setWeeklyReport(newValue);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to update preference');
      }
    } catch (error) {
      console.error('Failed to update preference:', error);
      alert('Failed to update preference. Please try again.');
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleLeaderboardToggle = async () => {
    setIsSavingLeaderboard(true);
    try {
      const res = await apiFetch('/api/affiliate/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardOptIn: !leaderboardOptIn }),
      });
      if (res.ok) {
        setLeaderboardOptIn(!leaderboardOptIn);
      }
    } catch (error) {
      console.error('Failed to update leaderboard opt-in:', error);
    } finally {
      setIsSavingLeaderboard(false);
    }
  };

  const handleAliasChange = async () => {
    setIsSavingLeaderboard(true);
    try {
      const res = await apiFetch('/api/affiliate/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAlias: leaderboardAlias.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to save alias');
      }
    } catch (error) {
      console.error('Failed to update leaderboard alias:', error);
    } finally {
      setIsSavingLeaderboard(false);
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
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-semibold text-gray-900">Account</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white p-6"
        >
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-gray-700 to-gray-900">
              {displayData.profile.avatarUrl ? (
                <img
                  src={displayData.profile.avatarUrl}
                  alt={displayData.profile.displayName}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <span className="text-2xl font-semibold text-white">
                  {displayData.profile.displayName.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {displayData.profile.displayName}
              </h2>
              <span className="mt-1 inline-block rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
                {displayData.profile.tier}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 py-3">
              <span className="text-gray-500">Phone</span>
              <span className="text-gray-900">{displayData.profile.phone}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 py-3">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-900">{displayData.profile.email}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-gray-500">Member since</span>
              <span className="text-gray-900">
                {new Date(displayData.profile.joinedAt).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>

          <Link
            href="/affiliate/account/edit"
            className="mt-4 block w-full rounded-xl border border-gray-200 py-3 text-center font-medium text-gray-900 transition-colors hover:bg-gray-50"
          >
            Edit Profile
          </Link>
        </motion.div>

        {/* Payout Method */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Payout Method</h3>
            <Link
              href="/affiliate/account/payout-method"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {displayData.payoutMethod ? 'Change' : 'Add'}
            </Link>
          </div>

          {displayData.payoutMethod && displayData.payoutMethod.type !== 'none' ? (
            <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                {displayData.payoutMethod.type === 'bank' ? (
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
                ) : (
                  <svg className="h-5 w-5 text-[#cab172]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {displayData.payoutMethod.type === 'bank'
                    ? `${displayData.payoutMethod.bankName} ••••${displayData.payoutMethod.last4}`
                    : displayData.payoutMethod.email}
                </p>
                <p className="text-sm capitalize text-gray-500">
                  {displayData.payoutMethod.type === 'bank' ? 'Bank Account' : 'PayPal'}
                </p>
              </div>
            </div>
          ) : (
            <Link
              href="/affiliate/account/payout-method"
              className="flex items-center gap-4 rounded-xl border-2 border-dashed border-gray-200 p-4 transition-colors hover:border-gray-300"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
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
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
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
          className="rounded-2xl bg-white p-6"
        >
          <div className="mb-4 flex items-center justify-between">
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
              <span
                className={`flex items-center gap-1.5 ${displayData.taxStatus.hasValidW9 ? 'text-green-600' : 'text-yellow-600'}`}
              >
                {displayData.taxStatus.hasValidW9 ? (
                  <>
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    On file
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Required
                  </>
                )}
              </span>
            </div>

            {displayData.taxStatus.yearToDateEarnings >= displayData.taxStatus.threshold && (
              <div className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800">
                <p className="font-medium">1099 eligible</p>
                <p className="mt-1 text-yellow-700">
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
          className="rounded-2xl bg-white p-6"
        >
          <h3 className="mb-4 font-semibold text-gray-900">Notifications</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-gray-900">Email notifications</p>
                <p className="text-sm text-gray-500">Earnings and payout updates</p>
              </div>
              <button
                onClick={() => handlePreferenceToggle('emailNotifications')}
                disabled={isSavingPreferences}
                className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${
                  emailNotifications ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                    emailNotifications ? 'left-5.5 translate-x-0' : 'left-0.5'
                  }`}
                  style={{
                    transform: emailNotifications ? 'translateX(20px)' : 'translateX(0)',
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
                onClick={() => handlePreferenceToggle('smsNotifications')}
                disabled={isSavingPreferences}
                className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${
                  smsNotifications ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform`}
                  style={{
                    transform: smsNotifications ? 'translateX(20px)' : 'translateX(0)',
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
                onClick={() => handlePreferenceToggle('weeklyReport')}
                disabled={isSavingPreferences}
                className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${
                  weeklyReport ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform`}
                  style={{
                    transform: weeklyReport ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Leaderboard Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="rounded-2xl bg-white p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-amber-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                />
              </svg>
              <h3 className="font-semibold text-gray-900">Leaderboard Settings</h3>
            </div>
            <Link
              href="/affiliate/leaderboard"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              View Leaderboard
            </Link>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-gray-900">Show on leaderboard</p>
                <p className="text-sm text-gray-500">Display your name on public rankings</p>
              </div>
              <button
                onClick={handleLeaderboardToggle}
                disabled={isSavingLeaderboard}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  leaderboardOptIn ? 'bg-amber-500' : 'bg-gray-200'
                } ${isSavingLeaderboard ? 'opacity-50' : ''}`}
              >
                <span
                  className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform"
                  style={{
                    transform: leaderboardOptIn ? 'translateX(20px)' : 'translateX(2px)',
                  }}
                />
              </button>
            </div>

            {leaderboardOptIn && (
              <div className="pt-2">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Display Name (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={leaderboardAlias}
                    onChange={(e) => setLeaderboardAlias(e.target.value)}
                    placeholder={displayData.profile.displayName}
                    maxLength={30}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                  <button
                    onClick={handleAliasChange}
                    disabled={isSavingLeaderboard}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">Leave blank to use your profile name</p>
              </div>
            )}

            {!leaderboardOptIn && (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                When disabled, you appear as &quot;Partner #
                {displayData.profile.displayName.slice(0, 3)}...&quot; on public leaderboards
              </p>
            )}
          </div>
        </motion.div>

        {/* Help & Legal */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="divide-y divide-gray-100 rounded-2xl bg-white"
        >
          <Link
            href="/affiliate/help"
            className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
          >
            <span className="text-gray-900">Help Center</span>
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/affiliate/terms"
            className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
          >
            <span className="text-gray-900">Partner Agreement</span>
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/privacy"
            className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
          >
            <span className="text-gray-900">Privacy Policy</span>
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
          className="w-full rounded-2xl py-4 font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoggingOut ? 'Signing out...' : 'Sign Out'}
        </motion.button>

        {/* Version */}
        <p className="pb-4 text-center text-xs text-gray-400">Version 1.0.0</p>
      </div>
    </div>
  );
}
