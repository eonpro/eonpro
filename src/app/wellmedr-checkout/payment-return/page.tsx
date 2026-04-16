'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import {
  getStripePublishableKey,
  getStripeConnectedAccountId,
} from '@/app/wellmedr-checkout/lib/stripe-config';
import { pushPurchase } from '@/app/wellmedr-checkout/lib/tracking';
import { event as trackMetaEvent } from '@/app/wellmedr-checkout/lib/fpixel';
import { trackCheckoutCompleted } from '@/app/wellmedr-checkout/lib/posthog-events';
import Header from '../components/ui/Header';
import { CHECKOUT_FORM_KEY } from '@/app/wellmedr-checkout/lib/session-keys';

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
        const publishableKey = getStripePublishableKey();
        const connectedAccountId = getStripeConnectedAccountId();
        const stripe = await loadStripe(publishableKey, {
          ...(connectedAccountId ? { stripeAccount: connectedAccountId } : {}),
        });
        if (!stripe) throw new Error('Stripe failed to load');

        const { paymentIntent: pi } = await stripe.retrievePaymentIntent(paymentIntentClientSecret);

        if (pi?.status === 'succeeded' || pi?.status === 'processing') {
          setStatus('success');

          // Fire purchase events for express checkout redirect path
          const transactionId = pi.id;
          const purchaseKey = `purchase_${transactionId}`;
          if (!localStorage.getItem(purchaseKey)) {
            try {
              const storedForm = sessionStorage.getItem(CHECKOUT_FORM_KEY);
              const formData = storedForm ? JSON.parse(storedForm) : null;
              const planDetails = formData?.planDetails;
              const selectedProduct = formData?.selectedProduct;

              if (planDetails && selectedProduct) {
                trackCheckoutCompleted({
                  order_id: transactionId,
                  amount: planDetails.totalPayToday,
                  currency: 'USD',
                  plan_id: planDetails.id,
                  payment_method: 'express',
                });

                await pushPurchase({
                  transactionId,
                  value: planDetails.totalPayToday,
                  product: {
                    productId: planDetails.id,
                    productName: `${selectedProduct.name} - ${selectedProduct.medicationType}`,
                    price: planDetails.totalPayToday,
                    planType: planDetails.plan_type,
                  },
                  coupon: formData.promoCode || undefined,
                  userData: {
                    email: formData.email,
                    firstName: formData.shippingAddress?.firstName,
                    lastName: formData.shippingAddress?.lastName,
                    city: formData.shippingAddress?.city,
                    state: formData.shippingAddress?.state,
                    zipCode: formData.shippingAddress?.zipCode,
                  },
                });

                trackMetaEvent('Purchase', {
                  content_ids: [planDetails.id],
                  content_type: 'product',
                  value: planDetails.totalPayToday,
                  currency: 'USD',
                  transaction_id: transactionId,
                });

                localStorage.setItem(purchaseKey, 'true');
              }
            } catch {
              /* non-critical — tracking should not block redirect */
            }
          }

          setTimeout(() => {
            router.push(`/wellmedr-checkout/thank-you?uid=${encodeURIComponent(uid)}`);
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
          router.push(`/wellmedr-checkout?uid=${encodeURIComponent(uid)}&payment_error=true`);
        }, 2500);
      } catch {
        setStatus('error');
        setErrorMessage('Failed to verify payment status.');
        const uid = searchParams.get('uid');
        setTimeout(() => {
          router.push(uid ? `/wellmedr-checkout?uid=${encodeURIComponent(uid)}&payment_error=true` : '/');
        }, 2500);
      }
    };

    checkPaymentStatus();
  }, [searchParams, router]);

  if (status === 'loading' || status === 'success') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#7b95a9] border-t-transparent" />
        <p className="text-lg text-gray-600">Verifying your payment...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>
      <p className="text-lg font-medium text-gray-800">{errorMessage || 'Payment not completed'}</p>
      <p className="opacity-50">Redirecting back to checkout...</p>
    </div>
  );
}

export default function WellmedrPaymentReturnPage() {
  return (
    <div className="wellmedr-checkout min-h-screen">
      <Header />
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 pb-[env(safe-area-inset-bottom)]">
        <Suspense
          fallback={
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#7b95a9] border-t-transparent" />
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
