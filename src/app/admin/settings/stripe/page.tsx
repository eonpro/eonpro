'use client';

/**
 * STRIPE CONNECT SETTINGS PAGE
 *
 * Self-service page for clinic admins to connect their own Stripe account.
 * Uses OAuth flow - users just log into their existing Stripe account!
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CreditCard,
  CheckCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Loader2,
  ChevronLeft,
  Link2,
  Unlink,
  Building2,
  DollarSign,
  Wallet,
  Shield,
  Settings,
  ArrowRight,
  XCircle,
  LogIn,
} from 'lucide-react';

interface StripeStatus {
  hasConnectedAccount: boolean;
  accountId: string | null;
  status: string | null;
  isPlatformAccount: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  connectedAt: string | null;
}

interface ClinicInfo {
  id: number;
  name: string;
}

export default function StripeSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [clinicId, setClinicId] = useState<number | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [oauthSupported, setOauthSupported] = useState(true);

  // Check for return from Stripe OAuth/onboarding
  useEffect(() => {
    const stripeReturn = searchParams.get('stripe');
    const message = searchParams.get('message');

    if (stripeReturn === 'connected') {
      setSuccess('Stripe account connected successfully! You can now accept payments.');
    } else if (stripeReturn === 'complete') {
      setSuccess('Stripe setup completed! Syncing your account status...');
      setTimeout(() => {
        handleSyncStatus();
      }, 1000);
    } else if (stripeReturn === 'refresh') {
      setError('Setup was interrupted. Please try again or continue where you left off.');
    } else if (stripeReturn === 'error') {
      setError(message ? decodeURIComponent(message) : 'Failed to connect Stripe account.');
    }
  }, [searchParams]);

  // Load user data and clinic status
  useEffect(() => {
    const loadData = async () => {
      try {
        const userData = localStorage.getItem('user');
        if (!userData) {
          router.push('/login');
          return;
        }

        const user = JSON.parse(userData);
        if (!['admin', 'super_admin'].includes(user.role?.toLowerCase())) {
          router.push('/login');
          return;
        }

        if (!user.clinicId) {
          setError('No clinic associated with your account');
          setLoading(false);
          return;
        }

        setClinicId(user.clinicId);
        await loadStripeStatus(user.clinicId);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [router]);

  const loadStripeStatus = async (id: number) => {
    try {
      const res = await fetch(`/api/stripe/connect?clinicId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setClinic(data.clinic);
        setStripeStatus(data.stripe);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load Stripe status');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  /**
   * Connect using OAuth - user logs into their existing Stripe account
   */
  const handleConnectWithOAuth = async () => {
    if (!clinicId) {
      setError('Missing clinic information');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/stripe/connect/oauth?clinicId=${clinicId}`);
      const data = await res.json();

      if (!res.ok) {
        // If OAuth not configured, fall back to standard onboarding
        if (res.status === 500 && data.error?.includes('not configured')) {
          setOauthSupported(false);
          setError('OAuth not configured. Using standard setup instead.');
          return;
        }
        throw new Error(data.error || 'Failed to start Stripe connection');
      }

      // Redirect to Stripe OAuth
      window.location.href = data.authorizeUrl;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Fallback: Create new account (if OAuth not available)
   */
  const handleCreateNewAccount = async () => {
    if (!clinicId) {
      setError('Missing clinic information');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      let adminEmail = '';
      const userData = localStorage.getItem('user');
      if (userData) {
        try {
          const parsed = JSON.parse(userData);
          adminEmail = parsed?.email ?? '';
        } catch {
          // Ignore corrupted localStorage
        }
      }

      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          email: adminEmail,
          businessType: 'company',
          country: 'US',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create Stripe account');
      }

      // Redirect to Stripe onboarding
      window.location.href = data.onboardingUrl;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleContinueOnboarding = async () => {
    if (!clinicId) return;

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/stripe/connect?clinicId=${clinicId}&action=onboarding`);
      const data = await res.json();

      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else {
        throw new Error(data.error || 'Failed to get onboarding link');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDashboard = async () => {
    if (!clinicId) return;

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/stripe/connect?clinicId=${clinicId}&action=dashboard`);
      const data = await res.json();

      if (data.dashboardUrl) {
        window.open(data.dashboardUrl, '_blank');
      } else {
        throw new Error(data.error || 'Dashboard access not available');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSyncStatus = useCallback(async () => {
    if (!clinicId) return;

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/stripe/connect?clinicId=${clinicId}&action=sync`);
      const data = await res.json();

      if (res.ok) {
        await loadStripeStatus(clinicId);
        setSuccess('Account status synced successfully');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to sync status');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }, [clinicId]);

  const handleDisconnect = async () => {
    if (!clinicId) return;

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/stripe/connect?clinicId=${clinicId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to disconnect account');
      }

      await loadStripeStatus(clinicId);
      setShowDisconnectConfirm(false);
      setSuccess('Stripe account disconnected');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-gray-500">Loading Stripe settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin/settings')}
              className="rounded-lg p-2 transition hover:bg-gray-100"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2">
                <CreditCard className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Stripe Connect</h1>
                <p className="text-sm text-gray-500">
                  {clinic?.name || 'Your Clinic'} - Payment Integration
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Alerts */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Platform Account Notice */}
        {stripeStatus?.isPlatformAccount && (
          <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-6">
            <div className="mb-2 flex items-center gap-3">
              <Building2 className="h-6 w-6 text-purple-600" />
              <h2 className="text-lg font-semibold text-purple-900">Platform Account</h2>
            </div>
            <p className="text-purple-700">
              This clinic is configured as the platform account. All payments are processed directly
              through the main Stripe account. No additional setup is required.
            </p>
          </div>
        )}

        {/* Not Connected State */}
        {!stripeStatus?.isPlatformAccount && !stripeStatus?.hasConnectedAccount && (
          <div className="space-y-6">
            {/* Hero Section */}
            <div className="rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 p-8 text-white">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-white/20 p-3">
                  <CreditCard className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <h2 className="mb-2 text-2xl font-bold">Connect Your Stripe Account</h2>
                  <p className="mb-6 text-purple-100">
                    Already have a Stripe account? Just log in and connect it in seconds. Don't have
                    one? We'll help you set one up.
                  </p>

                  <div className="flex flex-wrap gap-3">
                    {/* Primary: OAuth Login */}
                    <button
                      onClick={handleConnectWithOAuth}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-purple-700 transition hover:bg-purple-50 disabled:opacity-50"
                    >
                      {actionLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <LogIn className="h-5 w-5" />
                      )}
                      Connect with Stripe
                      <ArrowRight className="h-5 w-5" />
                    </button>

                    {/* Secondary: Create new account */}
                    {!oauthSupported && (
                      <button
                        onClick={handleCreateNewAccount}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-6 py-3 font-semibold text-white transition hover:bg-white/30 disabled:opacity-50"
                      >
                        <CreditCard className="h-5 w-5" />
                        Create New Account
                      </button>
                    )}
                  </div>

                  <p className="mt-4 text-sm text-purple-200">
                    You'll be redirected to Stripe to securely log in and authorize the connection.
                  </p>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-white p-5">
                <div className="mb-3 w-fit rounded-lg bg-emerald-100 p-2">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="mb-1 font-semibold text-gray-900">Direct Payments</h3>
                <p className="text-sm text-gray-600">
                  Funds go directly to your bank account. No middleman, fast payouts.
                </p>
              </div>
              <div className="rounded-xl border bg-white p-5">
                <div className="mb-3 w-fit rounded-lg bg-blue-100 p-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="mb-1 font-semibold text-gray-900">Secure & Compliant</h3>
                <p className="text-sm text-gray-600">
                  PCI DSS compliant. Industry-leading security and fraud protection.
                </p>
              </div>
              <div className="rounded-xl border bg-white p-5">
                <div className="mb-3 w-fit rounded-lg bg-purple-100 p-2">
                  <Settings className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="mb-1 font-semibold text-gray-900">Full Control</h3>
                <p className="text-sm text-gray-600">
                  Access your own Stripe dashboard. Manage disputes, refunds, and reports.
                </p>
              </div>
            </div>

            {/* How it Works */}
            <div className="rounded-xl border bg-white p-6">
              <h3 className="mb-4 font-semibold text-gray-900">How it Works</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 font-bold text-purple-600">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Click "Connect with Stripe"</h4>
                    <p className="text-sm text-gray-600">
                      You'll be redirected to Stripe's secure login page.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 font-bold text-purple-600">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Log In & Authorize</h4>
                    <p className="text-sm text-gray-600">
                      Log into your existing Stripe account, or create a new one if you don't have
                      one yet.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 font-bold text-purple-600">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Done! Start Accepting Payments</h4>
                    <p className="text-sm text-gray-600">
                      That's it! Payments go directly to your connected Stripe account.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connected State */}
        {!stripeStatus?.isPlatformAccount && stripeStatus?.hasConnectedAccount && (
          <div className="space-y-6">
            {/* Status Card */}
            <div
              className={`rounded-xl border p-6 ${
                stripeStatus.onboardingComplete
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-yellow-200 bg-yellow-50'
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {stripeStatus.onboardingComplete ? (
                    <CheckCircle className="h-8 w-8 text-emerald-600" />
                  ) : (
                    <Clock className="h-8 w-8 text-yellow-600" />
                  )}
                  <div>
                    <h2
                      className={`text-xl font-bold ${
                        stripeStatus.onboardingComplete ? 'text-emerald-900' : 'text-yellow-900'
                      }`}
                    >
                      {stripeStatus.onboardingComplete ? 'Stripe Connected' : 'Complete Your Setup'}
                    </h2>
                    <p
                      className={`text-sm ${
                        stripeStatus.onboardingComplete ? 'text-emerald-700' : 'text-yellow-700'
                      }`}
                    >
                      Account ID: <span className="font-mono">{stripeStatus.accountId}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSyncStatus}
                  disabled={actionLoading}
                  className="rounded-lg p-2 transition hover:bg-white/50"
                  title="Sync status"
                >
                  <RefreshCw className={`h-5 w-5 ${actionLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Status Grid */}
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-white/60 p-3">
                  <p className="mb-1 text-xs text-gray-500">Charges</p>
                  <p
                    className={`font-semibold ${
                      stripeStatus.chargesEnabled ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {stripeStatus.chargesEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div className="rounded-lg bg-white/60 p-3">
                  <p className="mb-1 text-xs text-gray-500">Payouts</p>
                  <p
                    className={`font-semibold ${
                      stripeStatus.payoutsEnabled ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {stripeStatus.payoutsEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div className="rounded-lg bg-white/60 p-3">
                  <p className="mb-1 text-xs text-gray-500">Details</p>
                  <p
                    className={`font-semibold ${
                      stripeStatus.detailsSubmitted ? 'text-emerald-600' : 'text-yellow-600'
                    }`}
                  >
                    {stripeStatus.detailsSubmitted ? 'Submitted' : 'Pending'}
                  </p>
                </div>
                <div className="rounded-lg bg-white/60 p-3">
                  <p className="mb-1 text-xs text-gray-500">Connected</p>
                  <p className="font-semibold text-gray-700">
                    {stripeStatus.connectedAt ? formatDate(stripeStatus.connectedAt) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                {!stripeStatus.onboardingComplete && (
                  <button
                    onClick={handleContinueOnboarding}
                    disabled={actionLoading}
                    className="flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-white transition hover:bg-yellow-600 disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Continue Setup
                  </button>
                )}
                {stripeStatus.onboardingComplete && (
                  <button
                    onClick={handleOpenDashboard}
                    disabled={actionLoading}
                    className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white transition hover:bg-purple-700 disabled:opacity-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Stripe Dashboard
                  </button>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            {stripeStatus.onboardingComplete && (
              <div className="grid gap-4 md:grid-cols-3">
                <a
                  href="/admin/stripe-dashboard"
                  className="group rounded-xl border bg-white p-5 transition hover:border-purple-300 hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="rounded-lg bg-emerald-100 p-2">
                      <Wallet className="h-5 w-5 text-emerald-600" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400 transition group-hover:text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">View Balance</h3>
                  <p className="text-sm text-gray-500">Check your current balance and payouts</p>
                </a>
                <a
                  href="/admin/stripe-dashboard?tab=transactions"
                  className="group rounded-xl border bg-white p-5 transition hover:border-purple-300 hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="rounded-lg bg-blue-100 p-2">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400 transition group-hover:text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Transactions</h3>
                  <p className="text-sm text-gray-500">View all charges and payments</p>
                </a>
                <a
                  href="/admin/stripe-dashboard?tab=customers"
                  className="group rounded-xl border bg-white p-5 transition hover:border-purple-300 hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="rounded-lg bg-purple-100 p-2">
                      <Building2 className="h-5 w-5 text-purple-600" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400 transition group-hover:text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Customers</h3>
                  <p className="text-sm text-gray-500">Manage customer payment methods</p>
                </a>
              </div>
            )}

            {/* Danger Zone */}
            <div className="rounded-xl border border-red-200 bg-white p-6">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-red-700">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                Disconnecting your Stripe account will prevent you from accepting payments. This
                action can be reversed by reconnecting.
              </p>
              {!showDisconnectConfirm ? (
                <button
                  onClick={() => setShowDisconnectConfirm(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-red-600 transition hover:bg-red-50"
                >
                  <Unlink className="h-4 w-4" />
                  Disconnect Stripe Account
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-red-600">Are you sure?</span>
                  <button
                    onClick={handleDisconnect}
                    disabled={actionLoading}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {actionLoading ? 'Disconnecting...' : 'Yes, Disconnect'}
                  </button>
                  <button
                    onClick={() => setShowDisconnectConfirm(false)}
                    className="rounded-lg border px-4 py-2 transition hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Configuration Note for Admins */}
        {error && error.includes('Invalid redirect URI') && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
              <AlertTriangle className="h-5 w-5" />
              Stripe Configuration Required
            </h3>
            <p className="mb-4 text-sm text-amber-800">
              The Stripe Connect redirect URI needs to be configured in the Stripe Dashboard. Please
              contact your platform administrator to add the following redirect URI:
            </p>
            <div className="break-all rounded-lg bg-amber-100 p-3 font-mono text-sm text-amber-900">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/api/stripe/connect/oauth/callback`
                : 'https://[your-domain]/api/stripe/connect/oauth/callback'}
            </div>
            <p className="mt-3 text-xs text-amber-700">
              This URI must be added in Stripe Dashboard → Connect → Settings → OAuth settings →
              Redirects.
            </p>
          </div>
        )}

        {/* FAQ */}
        <div className="mt-8 rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Frequently Asked Questions</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900">Can I use my existing Stripe account?</h4>
              <p className="text-sm text-gray-600">
                Yes! Just click "Connect with Stripe" and log into your existing account. No need to
                create a new one.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">What if I don't have a Stripe account?</h4>
              <p className="text-sm text-gray-600">
                No problem! When you click "Connect with Stripe", you'll have the option to create a
                new Stripe account during the process.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">What fees does Stripe charge?</h4>
              <p className="text-sm text-gray-600">
                Stripe charges 2.9% + $0.30 per successful transaction for US cards. International
                cards have additional fees. See Stripe's pricing page for details.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">When do I receive my payouts?</h4>
              <p className="text-sm text-gray-600">
                By default, Stripe pays out on a rolling 2-day schedule. You can customize this in
                your Stripe dashboard after connecting.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Is my data secure?</h4>
              <p className="text-sm text-gray-600">
                Yes! You log in directly on Stripe's secure site. We never see your Stripe password
                or banking information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
