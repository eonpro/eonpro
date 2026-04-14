'use client';

/**
 * Subscription & Billing – production: data from GET /api/patient-portal/billing (Stripe + local).
 * Shows card(s) on file with ability to add new cards (no delete).
 */

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { getCardNetworkLogo } from '@/lib/constants/brand-assets';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { toast } from '@/components/Toast';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import { SubscriptionPageSkeleton } from '@/components/patient-portal/PortalSkeletons';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { usePatientId } from '@/hooks/usePatientId';
const LazyAddCardStripeElements = dynamic(() => import('./AddCardStripeElements'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading secure payment form…
    </div>
  ),
});
import {
  CreditCard,
  Calendar,
  Package,
  Check,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  History,
  Plus,
  Shield,
  Loader2,
} from 'lucide-react';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface Subscription {
  id: string;
  planName: string;
  status: 'active' | 'paused' | 'cancelled';
  amount: number;
  interval: 'month' | 'year';
  nextBillingDate: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  description: string;
}

export default function SubscriptionPage() {
  const { branding } = useClinicBranding();
  const { t } = usePatientPortalLanguage();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';
  const { patientId, loading: patientIdLoading, error: patientIdError } = usePatientId();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [managingBilling, setManagingBilling] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const [showAddCard, setShowAddCard] = useState(false);
  const [addCardError, setAddCardError] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    setBillingError(null);
    try {
      const res = await portalFetch('/api/patient-portal/billing');
      const sessionErr = getPortalResponseError(res);
      if (sessionErr) {
        setBillingError(sessionErr);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const err = await safeParseJson(res);
        setBillingError(
          err !== null && typeof err === 'object' && 'error' in err
            ? String((err as { error?: unknown }).error)
            : 'Failed to load billing'
        );
        setLoading(false);
        return;
      }
      const data = await safeParseJson(res);

      if (data !== null && typeof data === 'object') {
        const dataObj = data as {
          subscription?: {
            id?: string;
            amount?: number;
            planName?: string;
            status?: string;
            interval?: string;
            currentPeriodEnd?: string;
            nextBillingDate?: string;
          } | null;
          paymentMethods?: {
            id?: string;
            brand?: string;
            last4?: string;
            expMonth?: number;
            expYear?: number;
            isDefault?: boolean;
          }[];
        };

        if (dataObj.subscription) {
          const sub = dataObj.subscription;
          const amountCents = typeof sub.amount === 'number' ? sub.amount : 0;
          setSubscription({
            id: sub.id || '',
            planName: sub.planName || 'Subscription',
            status: (sub.status === 'ACTIVE' ? 'active' : sub.status?.toLowerCase() || 'active') as
              | 'active'
              | 'cancelled'
              | 'paused',
            amount: amountCents / 100,
            interval: (sub.interval === 'year' ? 'year' : 'month') as 'month' | 'year',
            nextBillingDate: sub.currentPeriodEnd || sub.nextBillingDate || '',
          });
        } else {
          setSubscription(null);
        }

        if (dataObj.paymentMethods?.length) {
          setPaymentMethods(
            dataObj.paymentMethods.map((pm) => ({
              id: pm.id || '',
              brand: pm.brand || 'card',
              last4: pm.last4 || '****',
              expMonth: pm.expMonth || 0,
              expYear: pm.expYear || 0,
              isDefault: pm.isDefault || false,
            }))
          );
        } else {
          setPaymentMethods([]);
        }
      } else {
        setSubscription(null);
        setPaymentMethods([]);
      }

      const invList =
        data !== null &&
        typeof data === 'object' &&
        'invoices' in data &&
        Array.isArray((data as { invoices?: unknown[] }).invoices)
          ? (data as { invoices: unknown[] }).invoices
          : [];
      setInvoices(
        invList.map((inv: any) => ({
          id: String(inv.id),
          date: inv.date || inv.dueDate || '',
          amount: typeof inv.amount === 'number' ? inv.amount / 100 : 0,
          status: inv.status || 'pending',
          description: inv.description || 'Invoice',
        }))
      );
    } catch (e) {
      logger.error('Billing fetch error', {
        error: e instanceof Error ? e.message : 'Unknown',
      });
      setBillingError('Failed to load billing');
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setManagingBilling(true);
    try {
      const response = await portalFetch('/api/patient-portal/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });

      if (response.ok) {
        const parsed = await safeParseJson(response);
        const url =
          parsed !== null && typeof parsed === 'object' && 'url' in parsed
            ? (parsed as { url?: string }).url
            : undefined;
        if (url) window.location.href = url;
        else toast.error('Billing portal is not configured. Please contact support.');
      } else {
        const err = await safeParseJson(response);
        const errMsg =
          err !== null && typeof err === 'object' && 'error' in err
            ? String((err as { error?: unknown }).error)
            : 'Unable to open billing portal. Please contact support.';
        toast.error(errMsg);
      }
    } catch (error) {
      logger.error('Error opening billing portal', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      toast.error('Unable to open billing portal. Please try again later.');
    } finally {
      setManagingBilling(false);
    }
  };

  if (loading) {
    return <SubscriptionPageSkeleton />;
  }

  if (billingError) {
    const isSessionError =
      billingError.toLowerCase().includes('session') ||
      billingError.toLowerCase().includes('log in');
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
          <h2 className="mt-3 font-semibold text-amber-900">Unable to load billing</h2>
          <p className="mt-1 text-sm text-amber-800">{billingError}</p>
          <div className="mt-4 flex flex-col items-center gap-2">
            {isSessionError && (
              <a
                href={`/patient-login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/subscription`)}&reason=session_expired`}
                className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
              >
                Log in
              </a>
            )}
            <button
              onClick={loadSubscriptionData}
              className="rounded-xl px-4 py-2 font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">{t('subscriptionTitle')}</h1>
          <p className="mt-1 text-gray-500">{t('subscriptionSubtitle')}</p>
        </div>

        {/* Payment Methods – shown even without active subscription */}
        <PaymentMethodsSection
          paymentMethods={paymentMethods}
          primaryColor={primaryColor}
          showAddCard={showAddCard}
          setShowAddCard={setShowAddCard}
          addCardError={addCardError}
          setAddCardError={setAddCardError}
          patientId={patientId}
          patientIdLoading={patientIdLoading}
          patientIdError={patientIdError}
          onCardSaved={loadSubscriptionData}
          t={t}
        />

        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <CreditCard className="mx-auto h-12 w-12 text-gray-300" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">{t('subscriptionNoActive')}</h2>
          <p className="mt-2 text-sm text-gray-500">{t('subscriptionNoActiveDesc')}</p>
          <button
            onClick={handleManageBilling}
            disabled={managingBilling}
            className="mt-6 rounded-xl px-4 py-2 font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {managingBilling ? t('subscriptionOpening') : t('subscriptionManageBilling')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{t('subscriptionTitle')}</h1>
        <p className="mt-1 text-gray-500">{t('subscriptionSubtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Current Plan */}
          {subscription && (
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="p-6" style={{ backgroundColor: accentColor }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-sm font-medium" style={{ color: '#555' }}>
                      {t('subscriptionCurrentPlan')}
                    </p>
                    <h2 className="text-2xl font-semibold" style={{ color: '#1a1a1a' }}>
                      {subscription.planName}
                    </h2>
                  </div>
                  <span
                    className="rounded-full px-3 py-1.5 text-xs font-semibold uppercase"
                    style={{
                      backgroundColor: subscription.status === 'active' ? '#22C55E' : '#F59E0B',
                      color: 'white',
                    }}
                  >
                    {subscription.status}
                  </span>
                </div>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold" style={{ color: '#1a1a1a' }}>
                    ${subscription.amount}
                  </span>
                  <span style={{ color: '#555' }}>/{subscription.interval}</span>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">{t('subscriptionNextBilling')}</p>
                      <p className="font-semibold text-gray-900">
                        {subscription.nextBillingDate
                          ? (() => {
                              const date = new Date(subscription.nextBillingDate);
                              return isNaN(date.getTime())
                                ? '—'
                                : date.toLocaleDateString(undefined, {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                  });
                            })()
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Plan Features */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    {t('subscriptionPlanIncludes')}
                  </p>
                  {[
                    'Monthly medication supply',
                    'Provider consultations',
                    'Progress tracking tools',
                    'Nutrition guidance',
                    'Priority support',
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4" style={{ color: primaryColor }} />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Payment Methods */}
          <PaymentMethodsSection
            paymentMethods={paymentMethods}
            primaryColor={primaryColor}
            showAddCard={showAddCard}
            setShowAddCard={setShowAddCard}
            addCardError={addCardError}
            setAddCardError={setAddCardError}
            patientId={patientId}
            patientIdLoading={patientIdLoading}
            patientIdError={patientIdError}
            onCardSaved={loadSubscriptionData}
            t={t}
          />

          {/* Billing History */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{t('subscriptionBillingHistory')}</h3>
              <History className="h-5 w-5 text-gray-400" />
            </div>

            {invoices.length === 0 ? (
              <p className="py-8 text-center text-gray-500">{t('subscriptionNoBillingHistory')}</p>
            ) : (
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex cursor-pointer items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{invoice.description}</p>
                      <p className="text-sm text-gray-500">
                        {invoice.date
                          ? (() => {
                              const date = new Date(invoice.date);
                              return isNaN(date.getTime())
                                ? '—'
                                : date.toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  });
                            })()
                          : '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">${invoice.amount}</p>
                      <span
                        className={`text-xs font-medium ${
                          invoice.status === 'paid'
                            ? 'text-green-600'
                            : invoice.status === 'pending'
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">{t('subscriptionQuickActions')}</h3>

            <div className="space-y-3">
              <button
                onClick={handleManageBilling}
                disabled={managingBilling}
                className="flex w-full items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {t('subscriptionManageBilling')}
                  </span>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </button>

              <button
                onClick={handleManageBilling}
                disabled={managingBilling}
                className="flex w-full items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-gray-400" />
                  <span className="font-medium text-gray-700">{t('subscriptionChangePlan')}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Support Card */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
            <AlertCircle className="mb-3 h-6 w-6 text-blue-600" />
            <h3 className="mb-2 font-semibold text-blue-900">{t('subscriptionNeedHelp')}</h3>
            <p className="mb-4 text-sm text-blue-800">{t('subscriptionSupportDesc')}</p>
            <a
              href={`${PATIENT_PORTAL_PATH}/support`}
              className="block w-full rounded-xl bg-blue-600 py-2.5 text-center font-medium text-white transition-colors hover:bg-blue-700"
            >
              {t('subscriptionContactSupport')}
            </a>
          </div>

          {/* Cancellation Notice */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-sm text-gray-600">{t('subscriptionCancelNotice')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Add card: Stripe Elements (lazy-loaded) ─── */

/* ─── Payment Methods Section ─── */

interface PaymentMethodsSectionProps {
  paymentMethods: PaymentMethod[];
  primaryColor: string;
  showAddCard: boolean;
  setShowAddCard: (v: boolean) => void;
  addCardError: string | null;
  setAddCardError: (v: string | null) => void;
  patientId: number | null;
  patientIdLoading: boolean;
  patientIdError: string | null;
  onCardSaved: () => Promise<void>;
  t: (key: string) => string;
}

function PaymentMethodsSection({
  paymentMethods,
  primaryColor,
  showAddCard,
  setShowAddCard,
  addCardError,
  setAddCardError,
  patientId,
  patientIdLoading,
  patientIdError,
  onCardSaved,
  t,
}: PaymentMethodsSectionProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">{t('subscriptionPaymentMethod')}</h3>
          <div className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            <Shield className="h-3 w-3" />
            Secure
          </div>
        </div>
        {!showAddCard && (
          <button
            onClick={() => {
              setAddCardError(null);
              setShowAddCard(true);
            }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus className="h-4 w-4" />
            Add Card
          </button>
        )}
      </div>

      {/* Existing cards */}
      {paymentMethods.length > 0 ? (
        <div className="space-y-3">
          {paymentMethods.map((pm) => (
            <div
              key={pm.id}
              className={`flex items-center gap-4 rounded-xl p-4 ${
                pm.isDefault ? 'border border-green-200 bg-green-50/50' : 'bg-gray-50'
              }`}
            >
              <div className="rounded-lg p-2" style={{ backgroundColor: `${primaryColor}12` }}>
                {getCardNetworkLogo(pm.brand) ? (
                  <img
                    src={getCardNetworkLogo(pm.brand)!}
                    alt={pm.brand}
                    className="h-8 w-12 object-contain"
                    width={48}
                    height={32}
                    loading="lazy"
                  />
                ) : (
                  <CreditCard className="h-6 w-6" style={{ color: primaryColor }} />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold capitalize text-gray-900">•••• {pm.last4}</p>
                  {pm.isDefault && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  Expires {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : !showAddCard ? (
        <div className="py-6 text-center">
          <CreditCard className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">No payment methods on file</p>
          <button
            onClick={() => {
              setAddCardError(null);
              setShowAddCard(true);
            }}
            className="mt-2 text-sm font-medium hover:underline"
            style={{ color: primaryColor }}
          >
            Add your first card
          </button>
        </div>
      ) : null}

      {/* Add Card Form */}
      {showAddCard && (
        <div className={`${paymentMethods.length > 0 ? 'mt-4 border-t border-gray-100 pt-4' : ''}`}>
          <h4 className="mb-3 text-sm font-semibold text-gray-800">Add New Card</h4>

          {addCardError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {addCardError}
            </div>
          )}

          {patientIdLoading ? (
            <>
              <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Preparing payment form…
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddCard(false);
                  setAddCardError(null);
                }}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
            </>
          ) : patientId == null ? (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {patientIdError || 'Could not verify your account. Please refresh or log in again.'}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddCard(false);
                  setAddCardError(null);
                }}
                className="mt-3 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <LazyAddCardStripeElements
              patientId={patientId}
              paymentMethodsLength={paymentMethods.length}
              primaryColor={primaryColor}
              setShowAddCard={setShowAddCard}
              setAddCardError={setAddCardError}
              onCardSaved={onCardSaved}
            />
          )}
        </div>
      )}
    </div>
  );
}
