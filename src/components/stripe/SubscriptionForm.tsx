'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api/fetch';

// Initialize Stripe (only if key is available)
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceId: string;
  amount: number; // in cents
  interval: 'month' | 'year';
  features: string[];
}

// Sample subscription plans - replace with your actual plans
const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'basic',
    name: 'Basic Plan',
    description: 'Essential features for individual practitioners',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC || '',
    amount: 4900, // $49.00
    interval: 'month',
    features: ['Up to 50 patients', 'Basic prescriptions', 'Email support', 'Standard forms'],
  },
  {
    id: 'professional',
    name: 'Professional Plan',
    description: 'Advanced features for growing practices',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || '',
    amount: 9900, // $99.00
    interval: 'month',
    features: [
      'Unlimited patients',
      'Advanced prescriptions',
      'Priority support',
      'Custom forms',
      'Telehealth included',
      'SMS notifications',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise Plan',
    description: 'Complete solution for large clinics',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE || '',
    amount: 29900, // $299.00
    interval: 'month',
    features: [
      'Everything in Professional',
      'Multiple providers',
      'Advanced analytics',
      'API access',
      'Custom integrations',
      'Dedicated support',
    ],
  },
];

interface CheckoutFormProps {
  selectedPlan: SubscriptionPlan;
  customerId?: string;
  onSuccess: (subscriptionId: string) => void;
  onError: (error: string) => void;
}

function CheckoutForm({ selectedPlan, customerId, onSuccess, onError }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [clientSecret, setClientSecret] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Create subscription on the backend
    if (selectedPlan.priceId) {
      apiFetch('/api/v2/stripe/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: selectedPlan.priceId,
          customerId: customerId,
        }),
      })
        .then((res: any) => res.json())
        .then((data: any) => {
          if (data.clientSecret) {
            setClientSecret(data.clientSecret);
          } else {
            setError('Failed to initialize payment');
          }
        })
        .catch((err: any) => {
          setError(err.message);
          onError(err.message);
        });
    }
  }, [selectedPlan, customerId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    setProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    // Confirm the payment
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
      },
    });

    if (stripeError) {
      setError(stripeError.message || 'Payment failed');
      onError(stripeError.message || 'Payment failed');
      setProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    }

    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border bg-gray-50 p-4">
        <h3 className="mb-2 text-lg font-semibold">{selectedPlan.name}</h3>
        <p className="mb-2 text-gray-600">{selectedPlan.description}</p>
        <p className="mb-4 text-2xl font-bold">
          ${(selectedPlan.amount / 100).toFixed(2)}/{selectedPlan.interval}
        </p>
        <ul className="space-y-1">
          {selectedPlan.features.map((feature, index) => (
            <li key={index} className="flex items-start">
              <span className="mr-2 text-green-500">✓</span>
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border p-4">
        <label className="mb-2 block text-sm font-medium">Card Information</label>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className={`w-full rounded-lg px-4 py-3 font-semibold text-white transition-colors ${
          processing || !stripe ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {processing
          ? 'Processing...'
          : `Subscribe - $${(selectedPlan.amount / 100).toFixed(2)}/${selectedPlan.interval}`}
      </button>
    </form>
  );
}

export default function SubscriptionForm() {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [subscriptionComplete, setSubscriptionComplete] = useState(false);

  // Check if feature is enabled
  if (!isFeatureEnabled('STRIPE_SUBSCRIPTIONS')) {
    return (
      <div className="rounded-lg bg-gray-100 p-6">
        <p className="text-gray-600">Subscription billing coming soon!</p>
      </div>
    );
  }

  // Check if Stripe is properly configured
  if (!stripePromise) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
        <h3 className="mb-2 text-lg font-semibold text-yellow-800">Configuration Required</h3>
        <p className="text-yellow-700">
          Stripe is not configured. Please add your Stripe publishable key to the environment
          variables:
        </p>
        <code className="mt-2 block rounded bg-yellow-100 p-2 text-sm">
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
        </code>
      </div>
    );
  }

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setShowCheckout(true);
  };

  const handleSuccess = (subscriptionId: string) => {
    setSubscriptionComplete(true);
    // TODO: Update user's subscription status in database
    logger.debug('Subscription successful:', { value: subscriptionId });
  };

  const handleError = (error: string) => {
    logger.error('Subscription error:', error);
  };

  if (subscriptionComplete) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <h2 className="mb-2 text-2xl font-bold text-green-800">Subscription Successful!</h2>
          <p className="text-green-600">
            Your subscription has been activated. Thank you for your purchase.
          </p>
          <button
            onClick={() => (window.location.href = '/dashboard')}
            className="mt-4 rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (showCheckout && selectedPlan) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <button
          onClick={() => {
            setShowCheckout(false);
            setSelectedPlan(null);
          }}
          className="mb-4 text-blue-600 hover:underline"
        >
          ← Back to plans
        </button>

        {stripePromise ? (
          <Elements stripe={stripePromise}>
            <CheckoutForm
              selectedPlan={selectedPlan}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          </Elements>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-red-700">
              Unable to initialize payment form. Please check configuration.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-3xl font-bold">Choose Your Plan</h1>
        <p className="text-gray-600">Select the plan that best fits your practice needs</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan: any) => (
          <div key={plan.id} className="rounded-lg border p-6 transition-shadow hover:shadow-lg">
            <h3 className="mb-2 text-xl font-bold">{plan.name}</h3>
            <p className="mb-4 text-gray-600">{plan.description}</p>
            <div className="mb-6">
              <span className="text-3xl font-bold">${(plan.amount / 100).toFixed(2)}</span>
              <span className="text-gray-500">/{plan.interval}</span>
            </div>
            <ul className="mb-6 space-y-2">
              {plan.features.map((feature: string, index: number) => (
                <li key={index} className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSelectPlan(plan)}
              className="w-full rounded-lg bg-blue-600 py-2 text-white transition-colors hover:bg-blue-700"
            >
              Select Plan
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
