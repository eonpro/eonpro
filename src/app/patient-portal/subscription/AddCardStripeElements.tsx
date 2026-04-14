'use client';

import { useState, useEffect, useMemo } from 'react';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { toast } from '@/components/Toast';
import { safeParseJson } from '@/lib/utils/safe-json';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Shield, Loader2 } from 'lucide-react';

function AddCardPaymentFormInner({
  paymentMethodsLength,
  primaryColor,
  setShowAddCard,
  setAddCardError,
  onCardSaved,
}: {
  paymentMethodsLength: number;
  primaryColor: string;
  setShowAddCard: (v: boolean) => void;
  setAddCardError: (v: string | null) => void;
  onCardSaved: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddCardError(null);
    if (!stripe || !elements) {
      setAddCardError('Payment form not ready. Please try again.');
      return;
    }
    setSubmitting(true);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (error) {
        throw new Error(error.message || 'Card verification failed');
      }
      const rawPm = setupIntent?.payment_method;
      const stripePaymentMethodId =
        typeof rawPm === 'string'
          ? rawPm
          : rawPm && typeof rawPm === 'object' && 'id' in rawPm
            ? String((rawPm as { id: string }).id)
            : '';
      if (!stripePaymentMethodId) {
        throw new Error('No payment method returned');
      }

      const saveRes = await portalFetch('/api/patient-portal/billing/save-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripePaymentMethodId,
          setAsDefault: paymentMethodsLength === 0,
        }),
      });
      const saveData = await safeParseJson(saveRes);
      if (!saveRes.ok) {
        throw new Error(
          saveData && typeof saveData === 'object' && 'error' in saveData
            ? String((saveData as { error?: unknown }).error)
            : 'Failed to save card'
        );
      }

      setShowAddCard(false);
      toast.success('Payment method added successfully');
      await onCardSaved();
    } catch (err: unknown) {
      setAddCardError(err instanceof Error ? err.message : 'Failed to add payment method');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-1">
        <div className="flex items-center gap-2 px-3 pb-1 pt-2">
          <Shield className="h-3.5 w-3.5 text-green-600" />
          <span className="text-xs font-medium text-gray-500">
            Secure payment powered by Stripe
          </span>
        </div>
        <div className="rounded-lg bg-white p-3">
          <PaymentElement />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting || !stripe}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Adding…' : 'Add Card'}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowAddCard(false);
            setAddCardError(null);
          }}
          disabled={submitting}
          className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AddCardStripeElements({
  patientId,
  paymentMethodsLength,
  primaryColor,
  setShowAddCard,
  setAddCardError,
  onCardSaved,
}: {
  patientId: number;
  paymentMethodsLength: number;
  primaryColor: string;
  setShowAddCard: (v: boolean) => void;
  setAddCardError: (v: string | null) => void;
  onCardSaved: () => Promise<void>;
}) {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAddCardError(null);
    (async () => {
      setBooting(true);
      setBootError(null);
      try {
        const keyRes = await portalFetch(`/api/stripe/publishable-key?patientId=${patientId}`);
        const keySessionErr = getPortalResponseError(keyRes);
        if (keySessionErr) {
          if (!cancelled) setBootError(keySessionErr);
          return;
        }

        const setupRes = await portalFetch('/api/patient-portal/billing/setup-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const setupSessionErr = getPortalResponseError(setupRes);
        if (setupSessionErr) {
          if (!cancelled) setBootError(setupSessionErr);
          return;
        }

        const keyData = await safeParseJson(keyRes);
        const setupData = await safeParseJson(setupRes);

        if (!keyRes.ok) {
          const msg =
            keyData && typeof keyData === 'object' && 'error' in keyData
              ? String((keyData as { error?: unknown }).error)
              : 'Failed to load payment configuration';
          if (!cancelled) setBootError(msg);
          return;
        }
        if (!setupRes.ok) {
          const msg =
            setupData && typeof setupData === 'object' && 'error' in setupData
              ? String((setupData as { error?: unknown }).error)
              : 'Failed to initialize card setup';
          if (!cancelled) setBootError(msg);
          return;
        }

        const pk =
          keyData && typeof keyData === 'object' && 'publishableKey' in keyData
            ? (keyData as { publishableKey?: string }).publishableKey
            : undefined;
        const acctRaw =
          keyData && typeof keyData === 'object' && 'connectedAccountId' in keyData
            ? (keyData as { connectedAccountId?: string | null }).connectedAccountId
            : null;
        const cs =
          setupData && typeof setupData === 'object' && 'clientSecret' in setupData
            ? (setupData as { clientSecret?: string }).clientSecret
            : undefined;

        if (!pk || !cs) {
          if (!cancelled) {
            setBootError('Payment system is not configured. Please contact support.');
          }
          return;
        }
        if (!cancelled) {
          setPublishableKey(pk);
          setStripeAccountId(typeof acctRaw === 'string' && acctRaw.length > 0 ? acctRaw : null);
          setClientSecret(cs);
        }
      } catch {
        if (!cancelled) setBootError('Failed to load payment form');
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, setAddCardError]);

  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(
      publishableKey,
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  }, [publishableKey, stripeAccountId]);

  if (booting) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading secure payment form…
      </div>
    );
  }

  const displayError = bootError;
  if (displayError || !stripePromise || !clientSecret) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {displayError || 'Payment form could not be loaded. Please try again.'}
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: primaryColor,
            fontSizeBase: '16px',
          },
        },
      }}
    >
      <AddCardPaymentFormInner
        paymentMethodsLength={paymentMethodsLength}
        primaryColor={primaryColor}
        setShowAddCard={setShowAddCard}
        setAddCardError={setAddCardError}
        onCardSaved={onCardSaved}
      />
    </Elements>
  );
}
