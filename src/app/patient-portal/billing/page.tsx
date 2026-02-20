'use client';

/**
 * Billing Page
 * Payment history, invoices, and subscription management
 * Includes native controls for pause/resume/cancel subscriptions
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { getCardNetworkLogo } from '@/lib/constants/brand-assets';
import {
  CreditCard,
  Receipt,
  Download,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Calendar,
  Shield,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  XCircle,
  Pill,
  RefreshCw,
} from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import NextLink from 'next/link';
import { portalFetch, getPortalResponseError, SESSION_EXPIRED_MESSAGE } from '@/lib/api/patient-portal-client';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import { BillingPageSkeleton } from '@/components/patient-portal/PortalSkeletons';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface Invoice {
  id: string;
  number: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  date: string;
  dueDate: string;
  description: string;
  pdfUrl: string | null;
}

interface Subscription {
  id: string;
  planName: string;
  amount: number;
  interval: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface SubscriptionDetails {
  id: number;
  planId: string;
  planName: string;
  planDescription: string;
  amount: number;
  interval: string;
  intervalCount: number;
  status: string;
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string | null;
  canceledAt: string | null;
  pausedAt: string | null;
  resumeAt: string | null;
  vialCount: number;
  stripeSubscriptionId: string | null;
  nextRefill: {
    id: number;
    status: string;
    nextRefillDate: string;
    medicationName: string | null;
  } | null;
  recentActions: {
    id: number;
    actionType: string;
    reason: string | null;
    createdAt: string;
  }[];
}

interface BillingData {
  subscription: Subscription | null;
  paymentMethods: PaymentMethod[];
  invoices: Invoice[];
  upcomingInvoice: {
    amount: number;
    date: string;
  } | null;
}

const STATUS_CONFIG = {
  paid: { color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle },
  pending: { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: Clock },
  failed: { color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle },
  refunded: { color: 'text-gray-600', bg: 'bg-gray-100', icon: DollarSign },
};

const SUB_STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  ACTIVE: { badge: 'bg-green-100 text-green-700', label: 'Active' },
  active: { badge: 'bg-green-100 text-green-700', label: 'Active' },
  PAUSED: { badge: 'bg-amber-100 text-amber-700', label: 'Paused' },
  paused: { badge: 'bg-amber-100 text-amber-700', label: 'Paused' },
  CANCELED: { badge: 'bg-red-100 text-red-700', label: 'Canceled' },
  canceled: { badge: 'bg-red-100 text-red-700', label: 'Canceled' },
  PAST_DUE: { badge: 'bg-orange-100 text-orange-700', label: 'Past Due' },
  past_due: { badge: 'bg-orange-100 text-orange-700', label: 'Past Due' },
  EXPIRED: { badge: 'bg-gray-100 text-gray-700', label: 'Expired' },
};

type ConfirmAction = 'pause' | 'resume' | 'cancel' | null;

export default function BillingPage() {
  const { branding } = useClinicBranding();
  const { t } = usePatientPortalLanguage();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const brandLocale = (branding as Record<string, unknown> | null)?.locale as string || 'en-US';
  const brandCurrency = (branding as Record<string, unknown> | null)?.currency as string || 'USD';

  const [data, setData] = useState<BillingData | null>(null);
  const [subDetails, setSubDetails] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'methods'>('overview');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Subscription action state
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(true);
  const [pauseReason, setPauseReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoadError(null);
    setLoading(true);
    await Promise.all([fetchBillingData(), fetchSubscriptionDetails()]);
    setLoading(false);
  };

  const fetchBillingData = async () => {
    try {
      const res = await portalFetch('/api/patient-portal/billing');
      const err = getPortalResponseError(res);
      if (err) {
        setLoadError(err);
        return;
      }
      if (res.ok) {
        const result = await safeParseJson(res);
        setData(
          result !== null && typeof result === 'object' ? (result as BillingData) : null
        );
      }
    } catch (error) {
      logger.error('Failed to fetch billing data', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  };

  const fetchSubscriptionDetails = async () => {
    try {
      const res = await portalFetch('/api/patient-portal/subscription');
      if (res.ok) {
        const result = await safeParseJson(res);
        if (result && typeof result === 'object' && 'subscription' in result) {
          setSubDetails((result as { subscription: SubscriptionDetails | null }).subscription);
        }
      }
    } catch (error) {
      logger.error('Failed to fetch subscription details', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  };

  const openCustomerPortal = async () => {
    try {
      setLoadError(null);
      const res = await portalFetch('/api/patient-portal/billing/portal', {
        method: 'POST',
      });
      const sessionErr = getPortalResponseError(res);
      if (sessionErr) {
        setLoadError(sessionErr);
        return;
      }
      if (res.ok) {
        const parsed = await safeParseJson(res);
        const url =
          parsed !== null && typeof parsed === 'object' && 'url' in parsed
            ? (parsed as { url?: string }).url
            : undefined;
        if (url) {
          window.location.href = url;
        } else {
          setLoadError('Could not open billing portal. Please try again.');
        }
      } else {
        setLoadError('Could not open billing portal. Please try again later.');
      }
    } catch (error) {
      logger.error('Failed to open customer portal', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setLoadError('Unable to connect to billing portal. Please check your connection.');
    }
  };

  const handleSubscriptionAction = async (action: 'pause' | 'resume' | 'cancel') => {
    setActionLoading(true);
    setActionError(null);

    try {
      const bodyMap: Record<string, object> = {
        pause: { reason: pauseReason || undefined },
        resume: {},
        cancel: { reason: cancelReason || undefined, cancelAtPeriodEnd },
      };

      const res = await portalFetch(`/api/patient-portal/subscription/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyMap[action]),
      });

      if (res.ok) {
        setConfirmAction(null);
        setPauseReason('');
        setCancelReason('');
        await fetchAllData();
      } else {
        const result = await safeParseJson(res);
        const errorMsg =
          result && typeof result === 'object' && 'error' in result
            ? (result as { error: string }).error
            : `Failed to ${action} subscription`;
        setActionError(errorMsg);
      }
    } catch (error) {
      setActionError(`Unable to ${action} subscription. Please try again.`);
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat(brandLocale, {
      style: 'currency',
      currency: brandCurrency,
    }).format(amount / 100);
  }, [brandLocale, brandCurrency]);

  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(brandLocale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [brandLocale]);

  const totalPaid = useMemo(() => {
    return data?.invoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + i.amount, 0) || 0;
  }, [data?.invoices]);

  const memberSince = useMemo(() => {
    if (!data?.invoices?.length) return 'N/A';
    return formatDate(data.invoices[data.invoices.length - 1].date);
  }, [data?.invoices, formatDate]);

  const recentInvoices = useMemo(() => {
    return data?.invoices?.slice(0, 3) || [];
  }, [data?.invoices]);

  const subStatus = subDetails?.status || data?.subscription?.status || '';
  const normalizedStatus = subStatus.toUpperCase();
  const statusStyle = SUB_STATUS_STYLES[subStatus] || SUB_STATUS_STYLES[normalizedStatus] || {
    badge: 'bg-gray-100 text-gray-700',
    label: subStatus,
  };

  const hasSubscription = !!(subDetails || data?.subscription);
  const isActive = normalizedStatus === 'ACTIVE';
  const isPaused = normalizedStatus === 'PAUSED';
  const isCanceled = normalizedStatus === 'CANCELED' || normalizedStatus === 'EXPIRED';

  const formatInterval = (interval: string, count?: number) => {
    const c = count || 1;
    if (interval === 'year' || c === 12) return 'year';
    if (interval === 'semiannual' || c === 6) return '6 months';
    if (interval === 'quarter' || c === 3) return '3 months';
    return 'month';
  };

  if (loading) {
    return <BillingPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 md:p-6">
      {loadError && (
        <div
          className={`mb-6 flex items-center gap-3 rounded-xl border p-4 ${
            loadError === SESSION_EXPIRED_MESSAGE
              ? 'border-amber-200 bg-amber-50'
              : 'border-red-200 bg-red-50'
          }`}
          role="alert"
        >
          <AlertCircle className={`h-5 w-5 shrink-0 ${
            loadError === SESSION_EXPIRED_MESSAGE ? 'text-amber-600' : 'text-red-500'
          }`} />
          <p className={`flex-1 text-sm font-medium ${
            loadError === SESSION_EXPIRED_MESSAGE ? 'text-amber-900' : 'text-red-700'
          }`}>
            {loadError}
          </p>
          {loadError === SESSION_EXPIRED_MESSAGE ? (
            <NextLink
              href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/billing`)}&reason=session_expired`}
              className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
            >
              Log in
            </NextLink>
          ) : (
            <button
              onClick={() => { setLoadError(null); fetchAllData(); }}
              className="shrink-0 rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('billingTitle')}</h1>
        <p className="mt-1 text-gray-600">{t('billingSubtitle')}</p>
      </div>

      {/* Subscription Card */}
      {hasSubscription && (
        <div
          className="mb-6 rounded-2xl p-4 text-white sm:p-6"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-white/80">{t('billingCurrentPlan')}</p>
              <h2 className="mt-1 break-words text-xl font-bold sm:text-2xl">
                {subDetails?.planName || data?.subscription?.planName}
              </h2>
              <p className="mt-2 text-white/90">
                {formatCurrency(subDetails?.amount || data?.subscription?.amount || 0)} /{' '}
                {formatInterval(
                  subDetails?.interval || data?.subscription?.interval || 'month',
                  subDetails?.intervalCount
                )}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${
              isActive ? 'bg-white/20 text-white'
                : isPaused ? 'bg-amber-400/30 text-amber-100'
                : 'bg-red-400/30 text-red-100'
            }`}>
              {statusStyle.label}
            </span>
          </div>

          {/* Cancellation pending notice */}
          {data?.subscription?.cancelAtPeriodEnd && !isCanceled && (
            <div className="mt-4 rounded-xl bg-white/10 p-3">
              <p className="text-sm">
                Your subscription will cancel on{' '}
                {formatDate(subDetails?.currentPeriodEnd || data.subscription.currentPeriodEnd)}
              </p>
            </div>
          )}

          {/* Paused notice */}
          {isPaused && subDetails?.pausedAt && (
            <div className="mt-4 rounded-xl bg-white/10 p-3">
              <div className="flex items-center gap-2">
                <PauseCircle className="h-4 w-4 text-amber-200" />
                <p className="text-sm">
                  Paused since {formatDate(subDetails.pausedAt)}
                  {subDetails.resumeAt && ` — auto-resumes ${formatDate(subDetails.resumeAt)}`}
                </p>
              </div>
            </div>
          )}

          {/* Next billing / refill info */}
          <div className="mt-4 border-t border-white/20 pt-4 space-y-2">
            {subDetails?.nextBillingDate && isActive && (
              <div className="flex justify-between text-sm">
                <span className="text-white/80">{t('billingNextBillingDate')}</span>
                <span className="font-medium">{formatDate(subDetails.nextBillingDate)}</span>
              </div>
            )}
            {!subDetails?.nextBillingDate && data?.upcomingInvoice && isActive && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-white/80">{t('billingNextBillingDate')}</span>
                  <span className="font-medium">{formatDate(data.upcomingInvoice.date)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/80">{t('billingAmount')}</span>
                  <span className="font-medium">{formatCurrency(data.upcomingInvoice.amount)}</span>
                </div>
              </>
            )}
            {subDetails?.nextRefill && (
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1 text-white/80">
                  <Pill className="h-3.5 w-3.5" />
                  Next Refill
                </span>
                <span className="font-medium">
                  {subDetails.nextRefill.medicationName && `${subDetails.nextRefill.medicationName} — `}
                  {subDetails.nextRefill.status === 'PENDING_PROVIDER'
                    ? 'In provider queue'
                    : formatDate(subDetails.nextRefill.nextRefillDate)}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            {isActive && (
              <>
                <button
                  onClick={() => { setConfirmAction('pause'); setActionError(null); }}
                  className="flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/30"
                >
                  <PauseCircle className="h-4 w-4" />
                  Pause Subscription
                </button>
                <button
                  onClick={() => { setConfirmAction('cancel'); setActionError(null); }}
                  className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/20"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel
                </button>
              </>
            )}
            {isPaused && (
              <>
                <button
                  onClick={() => { setConfirmAction('resume'); setActionError(null); }}
                  className="flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/30"
                >
                  <PlayCircle className="h-4 w-4" />
                  Resume Subscription
                </button>
                <button
                  onClick={() => { setConfirmAction('cancel'); setActionError(null); }}
                  className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/20"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* No subscription — Start a Plan CTA */}
      {!hasSubscription && (
        <div className="mb-6 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <Pill className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">No Active Plan</h3>
          <p className="mt-1 text-sm text-gray-600">
            Start a subscription plan to receive automatic refills of your medication.
          </p>
          <NextLink
            href={`${PATIENT_PORTAL_PATH}/billing`}
            onClick={openCustomerPortal}
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            <RefreshCw className="h-4 w-4" />
            View Plans
          </NextLink>
        </div>
      )}

      {/* ─── Confirmation Dialog (overlay) ─── */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {confirmAction === 'pause' && (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                    <PauseCircle className="h-5 w-5 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Pause Subscription</h3>
                </div>
                <p className="mb-4 text-sm text-gray-600">
                  Your subscription billing will be paused and your next refill will be
                  put on hold until you resume. You can resume at any time.
                </p>
                <label className="mb-4 block">
                  <span className="text-sm font-medium text-gray-700">Reason (optional)</span>
                  <input
                    type="text"
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    placeholder="e.g., traveling, taking a break"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    maxLength={500}
                  />
                </label>
              </>
            )}

            {confirmAction === 'resume' && (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                    <PlayCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Resume Subscription</h3>
                </div>
                <p className="mb-4 text-sm text-gray-600">
                  Your subscription will resume and your next refill will be scheduled.
                  Billing will restart from today.
                </p>
              </>
            )}

            {confirmAction === 'cancel' && (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Cancel Subscription</h3>
                </div>
                <p className="mb-4 text-sm text-gray-600">
                  Are you sure? Canceling your subscription will stop future refills and billing.
                </p>
                <label className="mb-3 block">
                  <span className="text-sm font-medium text-gray-700">Reason (optional)</span>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g., no longer needed, switching providers"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    maxLength={500}
                  />
                </label>
                <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={cancelAtPeriodEnd}
                    onChange={(e) => setCancelAtPeriodEnd(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                    style={{ accentColor: primaryColor }}
                  />
                  Cancel at end of billing period (keep access until then)
                </label>
              </>
            )}

            {actionError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{actionError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmAction(null); setActionError(null); }}
                disabled={actionLoading}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Go Back
              </button>
              <button
                onClick={() => handleSubscriptionAction(confirmAction)}
                disabled={actionLoading}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                  confirmAction === 'cancel'
                    ? 'bg-red-600 hover:bg-red-700'
                    : confirmAction === 'pause'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {actionLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                {confirmAction === 'pause' && 'Pause'}
                {confirmAction === 'resume' && 'Resume'}
                {confirmAction === 'cancel' && 'Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2" role="tablist">
        {[
          { id: 'overview', label: t('billingOverview') },
          { id: 'history', label: t('billingPaymentHistory') },
          { id: 'methods', label: t('billingPaymentMethods') },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 font-medium transition-colors ${
              activeTab === tab.id ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={activeTab === tab.id ? { backgroundColor: primaryColor } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
              <div className="mb-1 flex items-center gap-2">
                <Receipt className="h-5 w-5 shrink-0 text-blue-500" />
                <span className="text-sm text-gray-600">{t('billingTotalPaid')}</span>
              </div>
              <p className="text-xl font-bold text-gray-900 sm:text-2xl">
                {formatCurrency(totalPaid)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
              <div className="mb-1 flex items-center gap-2">
                <Calendar className="h-5 w-5 shrink-0 text-green-500" />
                <span className="text-sm text-gray-600">{t('billingMemberSince')}</span>
              </div>
              <p className="text-xl font-bold text-gray-900 sm:text-2xl">{memberSince}</p>
            </div>
          </div>

          {/* Recent Invoices */}
          <div>
            <h3 className="mb-3 font-semibold text-gray-900">{t('billingRecentInvoices')}</h3>
            <div className="space-y-3">
              {recentInvoices.map((invoice) => {
                const status = STATUS_CONFIG[invoice.status];
                const StatusIcon = status.icon;

                return (
                  <div key={invoice.id} className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10 ${status.bg} flex items-center justify-center`}
                        >
                          <StatusIcon className={`h-4 w-4 sm:h-5 sm:w-5 ${status.color}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium leading-tight text-gray-900">{invoice.description}</p>
                          <p className="text-xs text-gray-500 sm:text-sm">{formatDate(invoice.date)}</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-gray-900 sm:text-base">
                          {formatCurrency(invoice.amount)}
                        </p>
                        <span className={`text-[10px] font-medium sm:text-xs ${status.color}`}>
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {(!data?.invoices || data.invoices.length === 0) && (
                <div className="rounded-xl bg-gray-50 py-8 text-center">
                  <Receipt className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p className="text-gray-600">{t('billingNoInvoices')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Security Notice */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 text-green-600" />
              <div>
                <h4 className="font-medium text-gray-900">{t('billingSecurePayments')}</h4>
                <p className="mt-1 text-sm text-gray-600">
                  {t('billingSecureDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {data?.invoices.map((invoice) => {
            const status = STATUS_CONFIG[invoice.status];
            const StatusIcon = status.icon;

            return (
              <div key={invoice.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-10 w-10 rounded-full ${status.bg} flex flex-shrink-0 items-center justify-center`}
                    >
                      <StatusIcon className={`h-5 w-5 ${status.color}`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{invoice.description}</p>
                      <p className="text-sm text-gray-500">Invoice #{invoice.number}</p>
                      <p className="text-sm text-gray-500">{formatDate(invoice.date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(invoice.amount)}</p>
                    <span className={`text-xs font-medium ${status.color}`}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </span>
                    {invoice.pdfUrl && (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-1 text-sm hover:underline"
                        style={{ color: primaryColor }}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {(!data?.invoices || data.invoices.length === 0) && (
            <div className="rounded-xl bg-gray-50 py-12 text-center">
              <Receipt className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-gray-600">{t('billingNoPaymentHistory')}</p>
            </div>
          )}
        </div>
      )}

      {/* Payment Methods Tab */}
      {activeTab === 'methods' && (
        <div className="space-y-4">
          {data?.paymentMethods.map((method) => (
            <div key={method.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-12 items-center justify-center rounded bg-gray-100">
                    {getCardNetworkLogo(method.brand) ? (
                      <img src={getCardNetworkLogo(method.brand)!} alt={method.brand} className="h-6 w-10 object-contain" />
                    ) : (
                      <CreditCard className="h-6 w-6 text-gray-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      •••• {method.last4}
                    </p>
                    <p className="text-sm text-gray-500">
                      Expires {method.expMonth}/{method.expYear}
                    </p>
                  </div>
                </div>
                {method.isDefault && (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                    {t('billingDefault')}
                  </span>
                )}
              </div>
            </div>
          ))}

          {(!data?.paymentMethods || data.paymentMethods.length === 0) && (
            <div className="rounded-xl bg-gray-50 py-12 text-center">
              <CreditCard className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-gray-600">{t('billingNoPaymentMethods')}</p>
            </div>
          )}

          <button
            onClick={openCustomerPortal}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-medium text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <CreditCard className="h-5 w-5" />
            {t('billingUpdatePayment')}
          </button>
        </div>
      )}
    </div>
  );
}
