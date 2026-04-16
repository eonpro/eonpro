'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
  Elements,
} from '@stripe/react-stripe-js';
import type {
  StripeExpressCheckoutElementConfirmEvent,
  StripeExpressCheckoutElementReadyEvent,
} from '@stripe/stripe-js';
import { validateCardholderName } from '@/app/wellmedr-checkout/lib/payment';
import Button from '@/app/wellmedr-checkout/components/ui/button/Button';
import { loadStripe } from '@stripe/stripe-js';
import PaymentHeader from './PaymentHeader';
import PaymentError from './PaymentError';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';
import {
  trackPaymentInfoSubmitted,
  trackCheckoutCompleted,
  trackCheckoutFailed,
  trackCheckoutStarted,
} from '@/app/wellmedr-checkout/lib/posthog-events';
import { event as trackMetaEvent } from '@/app/wellmedr-checkout/lib/fpixel';

import PaymentFooter from './PaymentFooter';
import InputField from '@/app/wellmedr-checkout/components/ui/InputField';
import PromoCodeSection from './PromoCodeSection';
import {
  getStripePublishableKey,
  getStripePaymentConfigId,
  getStripeConnectedAccountId,
} from '@/app/wellmedr-checkout/lib/stripe-config';
import { getAddonTotal } from '@/app/wellmedr-checkout/data/addons';
import { logger } from '@/app/wellmedr-checkout/utils/logger';
import { pushBeginCheckout, pushPurchase } from '@/app/wellmedr-checkout/lib/tracking';

/**
 * Fire purchase events across all platforms (GTM/GA4, Meta, PostHog).
 * Deduplicates via localStorage to prevent double-counting on page reloads.
 */
async function firePurchaseEvents(
  transactionId: string,
  formData: CheckoutFormData,
  paymentMethod: string
) {
  const purchaseKey = `purchase_${transactionId}`;
  if (typeof window === 'undefined' || localStorage.getItem(purchaseKey)) return;

  const planDetails = formData.planDetails;
  const selectedProduct = formData.selectedProduct;
  if (!planDetails || !selectedProduct) return;

  trackCheckoutCompleted({
    order_id: transactionId,
    amount: planDetails.totalPayToday,
    currency: 'USD',
    plan_id: planDetails.id,
    payment_method: paymentMethod,
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

const SUBSCRIPTION_STORAGE_KEY = 'wellmedr_subscription_id';

function storeSubscriptionId(subscriptionId: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SUBSCRIPTION_STORAGE_KEY, subscriptionId);
    console.log('[Subscription Storage] Stored subscription ID:', subscriptionId);
  } catch (e) {
    console.error('Failed to store subscription ID:', e);
  }
}

function clearSubscriptionId() {
  if (typeof window === 'undefined') return;
  try {
    const existingId = sessionStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    sessionStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
    console.log('[Subscription Storage] Cleared subscription ID:', existingId);
  } catch (e) {
    console.error('Failed to clear subscription ID:', e);
  }
}

// Load stripe once at module level to prevent recreation on re-renders.
// For direct charges via Connect, pass the connected account ID so Stripe.js
// scopes all operations to the WellMedR connected account.
const publishableKey = getStripePublishableKey();
const connectedAccountId = getStripeConnectedAccountId();
const stripePromise = publishableKey
  ? loadStripe(publishableKey, {
      ...(connectedAccountId ? { stripeAccount: connectedAccountId } : {}),
      developerTools: {
        assistant: {
          enabled: false,
        },
      },
    })
  : null;

interface PaymentFormProps {
  submissionId: string;
}

export default function PaymentForm({ submissionId }: PaymentFormProps) {
  const { watch } = useFormContext<CheckoutFormData>();
  const planDetails = watch('planDetails');
  const selectedProduct = watch('selectedProduct');
  const selectedAddons = watch('selectedAddons');
  const discountAmount = watch('discountAmount');
  const discountPercentage = watch('discountPercentage');

  // Addon total is a flat charge per billing cycle, not scaled by plan interval
  const addonAmount = getAddonTotal(selectedAddons || []);

  // Calculate amount in cents for Stripe Elements
  // Use discounted price if promo code applied, otherwise use totalPayToday + addons
  const baseAmount = (planDetails?.totalPayToday || 0) + addonAmount;

  // Calculate actual discount: use fixed amount if provided, otherwise calculate from percentage
  let actualDiscount = 0;
  if (discountAmount && discountAmount > 0) {
    actualDiscount = discountAmount;
  } else if (discountPercentage && discountPercentage > 0) {
    actualDiscount = ((planDetails?.totalPayToday || 0) * discountPercentage) / 100;
  }

  const finalAmount = actualDiscount > 0 ? baseAmount - actualDiscount : baseAmount;
  const amountInCents = Math.round(Math.max(finalAmount, 1) * 100);

  // Show user-friendly error if publishable key is not available
  if (!publishableKey) {
    return <PaymentError />;
  }

  // Show message if plan not selected yet
  if (!planDetails || !selectedProduct) {
    return (
      <div className="flex w-full flex-col gap-6 sm:gap-8">
        <h2 className="text-center">Payment method</h2>
        <div className="card flex flex-col items-center gap-4 py-12 sm:gap-6">
          <p className="text-lg text-gray-600">Please select a plan to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        mode: 'subscription',
        amount: amountInCents,
        currency: 'usd',
        paymentMethodConfiguration: getStripePaymentConfigId(),
      }}
      // Only re-key on plan change, NOT on discount change
      // This preserves card input data when promo codes are applied
      // The backend applies the correct discount via promotionCodeId regardless of displayed amount
      key={planDetails.id}
    >
      <PaymentContent submissionId={submissionId} />
    </Elements>
  );
}

interface PaymentContentProps {
  submissionId: string;
}

function PaymentContent({ submissionId }: PaymentContentProps) {
  // Card element validation states
  const [cardNumberValid, setCardNumberValid] = useState(false);
  const [cardExpiryValid, setCardExpiryValid] = useState(false);
  const [cardCvcValid, setCardCvcValid] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMethod, setProcessingMethod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expressCheckoutReady, setExpressCheckoutReady] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);

  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { watch, getValues } = useFormContext<CheckoutFormData>();

  const cardholder = watch('cardholderName');
  const planDetails = watch('planDetails');
  const selectedProduct = watch('selectedProduct');

  // Track checkout started when component mounts
  const checkoutStartedRef = useRef(false);
  useEffect(() => {
    if (planDetails && selectedProduct && !checkoutStartedRef.current) {
      checkoutStartedRef.current = true;

      trackCheckoutStarted({
        plan_id: planDetails.id,
        amount: planDetails.totalPayToday,
        currency: 'USD',
        product_name: selectedProduct.name,
        medication_type: selectedProduct.medicationType,
      });

      pushBeginCheckout({
        productId: planDetails.id,
        productName: `${selectedProduct.name} - ${selectedProduct.medicationType}`,
        price: planDetails.totalPayToday,
        planType: planDetails.plan_type,
      });

      trackMetaEvent('InitiateCheckout', {
        content_ids: [planDetails.id],
        content_type: 'product',
        value: planDetails.totalPayToday,
        currency: 'USD',
      });
    }
  }, [planDetails, selectedProduct]);

  // Reset processing state when component mounts (handles redirect return)
  useEffect(() => {
    setIsProcessing(false);
    setProcessingMethod(null);
  }, []);

  // Helper function to create subscription
  const createSubscription = useCallback(async () => {
    const formData = getValues();
    logger.log('[CLIENT] Starting createSubscription...');
    const startTime = performance.now();

    if (!formData.planDetails || !formData.selectedProduct) {
      throw new Error('Please select a plan before proceeding.');
    }

    if (!formData.email) {
      throw new Error('Email is required.');
    }

    if (!formData.shippingAddress?.firstName) {
      throw new Error('Shipping address is required.');
    }

    const storedPatientId = typeof window !== 'undefined'
      ? sessionStorage.getItem('wellmedr_patient_id')
      : null;

    logger.log('[CLIENT] Calling /api/create-subscription...');
    const response = await fetch('/api/wellmedr/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: formData.planDetails.id,
        customerEmail: formData.email,
        customerName: `${formData.shippingAddress.firstName} ${formData.shippingAddress.lastName}`,
        cardholderName:
          formData.cardholderName ||
          `${formData.shippingAddress.firstName} ${formData.shippingAddress.lastName}`,
        shippingAddress: formData.shippingAddress,
        billingAddress: formData.shippingAddress.billingAddressSameAsShipment
          ? formData.shippingAddress
          : formData.billingAddress,
        submissionId,
        productName: formData.selectedProduct.name,
        medicationType: formData.selectedProduct.medicationType,
        planType: formData.planDetails.plan_type,
        selectedAddons: formData.selectedAddons || [],
        promotionCodeId: formData.promotionCodeId,
        ...(storedPatientId ? { patientId: storedPatientId } : {}),
      }),
    });
    logger.log(
      `[CLIENT] /api/create-subscription completed in ${(performance.now() - startTime).toFixed(0)}ms`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create subscription');
    }

    // Store subscription ID in sessionStorage for form recovery
    if (data.subscriptionId) {
      storeSubscriptionId(data.subscriptionId);
    }

    return data;
  }, [getValues, submissionId]);

  const handleCardNumberChange = useCallback((event: any) => {
    setCardNumberValid(event.complete && !event.error);
  }, []);

  const handleCardExpiryChange = useCallback((event: any) => {
    setCardExpiryValid(event.complete && !event.error);
  }, []);

  const handleCardCvcChange = useCallback((event: any) => {
    setCardCvcValid(event.complete && !event.error);
  }, []);

  const allCardsValid = cardNumberValid && cardExpiryValid && cardCvcValid;

  // Get billing details for payment methods
  const getBillingDetails = useCallback(() => {
    const formData = getValues();
    const useBillingAddress = !formData.shippingAddress.billingAddressSameAsShipment;
    const address = useBillingAddress ? formData.billingAddress : formData.shippingAddress;

    return {
      name:
        formData.cardholderName ||
        `${formData.shippingAddress.firstName} ${formData.shippingAddress.lastName}`,
      email: formData.email,
      address: {
        line1: address.address,
        line2: address.apt || '',
        city: address.city,
        state: address.state,
        postal_code: address.zipCode,
        country: 'US',
      },
    };
  }, [getValues]);

  /** Express Checkout Element ready handler */
  const handleExpressCheckoutReady = useCallback(
    (event: StripeExpressCheckoutElementReadyEvent) => {
      // Check if any payment methods are available
      if (event.availablePaymentMethods) {
        setExpressCheckoutReady(true);
      }
    },
    []
  );

  /** Express Checkout Element confirm handler */
  const handleExpressCheckoutConfirm = useCallback(
    async (_event: StripeExpressCheckoutElementConfirmEvent) => {
      if (!stripe || !elements) return;

      const formData = getValues();
      setError(null);
      setIsProcessing(true);
      setProcessingMethod('express');

      // Track payment info submitted for express checkout (PostHog)
      if (formData.planDetails) {
        trackPaymentInfoSubmitted({
          payment_method_type: 'express',
          plan_id: formData.planDetails.id,
          amount: formData.planDetails.totalPayToday,
        });

        // GTM add_payment_info event for express checkout
        if (
          typeof window !== 'undefined' &&
          window.dataLayer &&
          formData.selectedProduct
        ) {
          window.dataLayer.push({
            event: 'add_payment_info',
            ecommerce: {
              currency: 'USD',
              value: formData.planDetails.totalPayToday,
              payment_type: 'express',
              items: [
                {
                  item_id: formData.planDetails.id,
                  item_name: `${formData.selectedProduct.name} - ${formData.selectedProduct.medicationType}`,
                  price: formData.planDetails.totalPayToday,
                  quantity: 1,
                },
              ],
            },
          });
        }
      }

      try {
        // Step 1: Create subscription to get clientSecret
        const subscriptionData = await createSubscription();

        // If subscription is already active (100% discount), redirect to thank you
        if (subscriptionData.status === 'active' && subscriptionData.success) {
          const formData = getValues();
          await firePurchaseEvents(subscriptionData.subscriptionId || submissionId, formData, 'express_free');
          clearSubscriptionId();
          setPaymentCompleted(true);
          router.push(`/wellmedr-checkout/thank-you?uid=${submissionId}`);
          return;
        }

        if (!subscriptionData.clientSecret) {
          throw new Error('Failed to initialize payment. Please try again.');
        }

        // Step 2: Confirm payment with the clientSecret
        const { error: confirmError } = await stripe.confirmPayment({
          elements,
          clientSecret: subscriptionData.clientSecret,
          confirmParams: {
            return_url: `${window.location.origin}/wellmedr-checkout/payment-return?uid=${submissionId}`,
          },
        });

        // If confirmPayment returns, it means an error occurred
        // (successful payments redirect automatically)
        if (confirmError) {
          throw new Error(confirmError.message);
        }
      } catch (err: any) {
        logger.error('Express checkout error:', err);
        // Track checkout failed
        trackCheckoutFailed({
          error_message: err?.message || 'Payment failed',
          payment_method_type: 'express',
        });
        setError(err?.message || 'Payment failed. Please try again.');
        setIsProcessing(false);
        setProcessingMethod(null);
      }
    },
    [stripe, elements, submissionId, getValues, createSubscription, router]
  );

  /** Card payment submission handler */
  const handleCardSubmit = useCallback(async () => {
    setError(null);
    const { isValid } = validateCardholderName(cardholder);
    if (!isValid) {
      setError('Please enter a valid cardholder name');
      return;
    }

    if (!allCardsValid) {
      setError('Please complete your card details');
      return;
    }
    if (!stripe || !elements) return;

    const formData = getValues();
    if (!formData.planDetails || !formData.selectedProduct) {
      setError('Please select a plan');
      return;
    }

    if (!formData.email) {
      console.error('[PaymentSection] Missing email — cannot proceed');
      return;
    }

    setIsProcessing(true);
    setProcessingMethod('card');

    // Track payment info submitted (PostHog)
    trackPaymentInfoSubmitted({
      payment_method_type: 'card',
      plan_id: formData.planDetails.id,
      amount: formData.planDetails.totalPayToday,
    });

    // GTM add_payment_info event (GA4 standard ecommerce)
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'add_payment_info',
        ecommerce: {
          currency: 'USD',
          value: formData.planDetails.totalPayToday,
          payment_type: 'card',
          items: [
            {
              item_id: formData.planDetails.id,
              item_name: `${formData.selectedProduct.name} - ${formData.selectedProduct.medicationType}`,
              price: formData.planDetails.totalPayToday,
              quantity: 1,
            },
          ],
        },
      });
    }

    // Meta Pixel AddPaymentInfo
    trackMetaEvent('AddPaymentInfo', {
      content_ids: [formData.planDetails.id],
      value: formData.planDetails.totalPayToday,
      currency: 'USD',
    });

    try {
      const totalStart = performance.now();

      // Step 1: Create subscription to get clientSecret
      logger.log('[CLIENT] Step 1: Creating subscription...');
      const subscriptionData = await createSubscription();
      logger.log(`[CLIENT] Step 1 completed in ${(performance.now() - totalStart).toFixed(0)}ms`);

      // If subscription is already active (100% discount), redirect to thank you
      if (subscriptionData.status === 'active' && subscriptionData.success) {
        await firePurchaseEvents(subscriptionData.subscriptionId || submissionId, formData, 'card_free');
        clearSubscriptionId();
        setPaymentCompleted(true);
        router.push(`/wellmedr-checkout/thank-you?uid=${submissionId}`);
        return;
      }

      if (!subscriptionData.clientSecret) {
        throw new Error('Failed to initialize payment. Please try again.');
      }

      const cardElement = elements.getElement(CardNumberElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Step 2: Confirm payment with the clientSecret
      logger.log('[CLIENT] Step 2: Confirming card payment...');
      const confirmStart = performance.now();
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        subscriptionData.clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: getBillingDetails(),
          },
        }
      );
      logger.log(
        `[CLIENT] Step 2 (confirmCardPayment) completed in ${(performance.now() - confirmStart).toFixed(0)}ms`
      );
      logger.log(`[CLIENT] Total payment flow: ${(performance.now() - totalStart).toFixed(0)}ms`);

      if (confirmError) {
        throw new Error(confirmError.message);
      }

      if (!paymentIntent) {
        throw new Error('Payment confirmation failed. Please try again.');
      }

      if (paymentIntent.status === 'succeeded') {
        const transactionId = subscriptionData.subscriptionId || paymentIntent.id;
        await firePurchaseEvents(transactionId, formData, 'card');

        clearSubscriptionId();
        setPaymentCompleted(true);
        router.push(`/wellmedr-checkout/thank-you?uid=${submissionId}`);
        return;
      } else if (paymentIntent.status === 'requires_payment_method') {
        throw new Error('Your card was declined. Please try a different payment method.');
      } else if (paymentIntent.status === 'requires_action') {
        throw new Error('Authentication was not completed. Please try again.');
      } else {
        throw new Error(`Payment status: ${paymentIntent.status}. Please contact support.`);
      }
    } catch (err: any) {
      logger.error('Payment Error:', err);
      // Track checkout failed
      trackCheckoutFailed({
        error_message: err?.message || 'Payment failed',
        payment_method_type: 'card',
      });
      setError(err?.message || 'Payment failed. Please try again or contact support.');
      setIsProcessing(false);
      setProcessingMethod(null);
    }
  }, [
    cardholder,
    allCardsValid,
    stripe,
    elements,
    getValues,
    router,
    submissionId,
    createSubscription,
    getBillingDetails,
  ]);

  const isCardDisabled =
    !validateCardholderName(cardholder || '').isValid ||
    !allCardsValid ||
    isProcessing ||
    !stripe ||
    !elements;

  const baseStripeStyle = {
    base: {
      fontSize: '16px',
      color: '#101010',
      fontFamily: 'var(--font-outfit), sans-serif',
      '::placeholder': {
        color: '#1010104D',
      },
    },
    invalid: {
      color: '#ef4444',
    },
  };

  const cardNumberOptions = {
    style: baseStripeStyle,
    disableLink: true,
  };

  const cardElementOptions = {
    style: baseStripeStyle,
  };

  // Express Checkout Element options
  const expressCheckoutOptions = {
    buttonHeight: 48,
    buttonTheme: {
      applePay: 'black' as const,
      googlePay: 'black' as const,
    },
    buttonType: {
      applePay: 'plain' as const,
      googlePay: 'plain' as const,
      klarna: 'pay' as const,
    },
    // Order: Apple Pay, Google Pay, Link, Amazon Pay, Klarna
    paymentMethodOrder: ['apple_pay', 'google_pay', 'link', 'amazon_pay', 'klarna'],
    layout: {
      maxColumns: 3,
      maxRows: 2,
    },
    shippingAddressRequired: true,
  };

  // If payment was already completed, show redirect message
  if (paymentCompleted) {
    return (
      <div className="flex w-full flex-col gap-6 sm:gap-8">
        <h2 className="text-center">Payment method</h2>
        <div className="card flex flex-col items-center gap-4 py-12 sm:gap-6">
          <div className="border-primary h-12 w-12 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="text-lg text-gray-600">Payment successful! Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 sm:gap-8">
      <h2 className="text-center">Payment method</h2>

      {/* Express Checkout */}
      <div className="card w-full bg-white sm:p-6">
        <h3 className="mb-4 text-center text-base sm:mb-6 sm:text-xl">Express Checkout</h3>

        {/* Stripe Express Checkout Element */}
        <ExpressCheckoutElement
          options={expressCheckoutOptions}
          onReady={handleExpressCheckoutReady}
          onConfirm={handleExpressCheckoutConfirm}
        />

        {/* Show loading state while express checkout initializes */}
        {!expressCheckoutReady && (
          <div className="mt-2 flex justify-center gap-4">
            <div className="h-10 w-full animate-pulse rounded-md bg-gray-100" />
            <div className="h-10 w-full animate-pulse rounded-md bg-gray-100" />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-sm opacity-50">OR</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* Card Payment Form */}
      <form
        className="card flex flex-col gap-4 sm:gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          handleCardSubmit();
        }}
      >
        <PaymentHeader />

        {/* Card Number */}
        <div className="flex flex-col gap-2">
          <label className="form-label">Card number</label>
          <div className="form-input">
            <CardNumberElement
              onChange={handleCardNumberChange}
              options={cardNumberOptions}
              className="text-foreground py-3"
            />
          </div>
        </div>

        {/* Expiration and CVV */}
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <label className="form-label">Expiration date</label>
            <div className="form-input">
              <CardExpiryElement
                onChange={handleCardExpiryChange}
                options={cardElementOptions}
                className="text-foreground py-3 placeholder:opacity-30"
              />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className="form-label">CVV</label>
            <div className="form-input">
              <CardCvcElement
                onChange={handleCardCvcChange}
                options={cardElementOptions}
                className="text-foreground py-3"
              />
            </div>
          </div>
        </div>

        {/* Name on Card */}
        <InputField name="cardholderName" label="Name on card" placeholder="John Doe" />

        {/* Promo Code */}
        <PromoCodeSection />

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col bg-white px-4 pb-[env(safe-area-inset-bottom)] pt-3 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0">
          <Button
            onClick={handleCardSubmit}
            text={processingMethod === 'card' ? 'Processing...' : 'Place my order'}
            disabled={isCardDisabled}
            suffix={processingMethod === 'card' ? null : undefined}
          />

          {error && (
            <div role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-500">{error}</div>
          )}
        </div>

        <PaymentFooter />
      </form>
    </div>
  );
}
