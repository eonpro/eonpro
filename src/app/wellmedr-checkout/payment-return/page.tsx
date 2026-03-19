'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import Header from '../components/ui/Header';

const SUBSCRIPTION_STORAGE_KEY = 'wellmedr_subscription_id';

function clearSubscriptionId() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
  } catch {}
}

function PaymentReturnContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      const paymentIntentClientSecret = searchParams.get('payment_intent_client_secret');
      const redirectStatus = searchParams.get('redirect_status');
      const uid = searchParams.get('uid');

      if (!paymentIntentClientSecret || !uid) {
        router.push('/');
        return;
      }

      try {
        const publishableKey = process.env.NEXT_PUBLIC_WELLMEDR_STRIPE_PUBLISHABLE_KEY
          || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error('Stripe failed to load');

        const { paymentIntent: pi } = await stripe.retrievePaymentIntent(paymentIntentClientSecret);

        if (pi?.status === 'succeeded' || pi?.status === 'processing') {
          clearSubscriptionId();
          setStatus('success');
          setTimeout(() => {
            router.push(`/wellmedr-checkout/thank-you?uid=${uid}`);
          }, 1000);
          return;
        }

        setStatus('error');
        if (redirectStatus === 'failed') {
          setErrorMessage('Payment failed. Please try again.');
        } else if (pi?.status === 'requires_payment_method') {
          setErrorMessage('Payment was cancelled.');
        } else {
          setErrorMessage(`Payment status: ${pi?.status || redirectStatus}`);
        }

        setTimeout(() => {
          router.push(`/wellmedr-checkout?uid=${uid}&payment_error=true`);
        }, 2500);
      } catch {
        setStatus('error');
        setErrorMessage('Failed to verify payment status.');
        const uid = searchParams.get('uid');
        setTimeout(() => {
          router.push(uid ? `/wellmedr-checkout?uid=${uid}&payment_error=true` : '/');
        }, 2500);
      }
    };

    checkPaymentStatus();
  }, [searchParams, router]);

  if (status === 'loading' || status === 'success') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#7b95a9] border-t-transparent rounded-full animate-spin" />
        <p className="text-lg text-gray-600">Verifying your payment...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <p className="text-lg text-gray-800 font-medium">{errorMessage || 'Payment not completed'}</p>
      <p className="opacity-50">Redirecting back to checkout...</p>
    </div>
  );
}

export default function WellmedrPaymentReturnPage() {
  return (
    <div className="wellmedr-checkout min-h-screen">
      <Header />
      <main className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Suspense
          fallback={
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-[#7b95a9] border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-gray-600">Verifying your payment...</p>
            </div>
          }
        >
          <PaymentReturnContent />
        </Suspense>
      </main>
    </div>
  );
}
