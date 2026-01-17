"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { isFeatureEnabled } from "@/lib/features";
import { logger } from '@/lib/logger';

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
  interval: "month" | "year";
  features: string[];
}

// Sample subscription plans - replace with your actual plans
const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "basic",
    name: "Basic Plan",
    description: "Essential features for individual practitioners",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC || "",
    amount: 4900, // $49.00
    interval: "month",
    features: [
      "Up to 50 patients",
      "Basic prescriptions",
      "Email support",
      "Standard forms"
    ]
  },
  {
    id: "professional",
    name: "Professional Plan",
    description: "Advanced features for growing practices",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "",
    amount: 9900, // $99.00
    interval: "month",
    features: [
      "Unlimited patients",
      "Advanced prescriptions",
      "Priority support",
      "Custom forms",
      "Telehealth included",
      "SMS notifications"
    ]
  },
  {
    id: "enterprise",
    name: "Enterprise Plan",
    description: "Complete solution for large clinics",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE || "",
    amount: 29900, // $299.00
    interval: "month",
    features: [
      "Everything in Professional",
      "Multiple providers",
      "Advanced analytics",
      "API access",
      "Custom integrations",
      "Dedicated support"
    ]
  }
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
  const [clientSecret, setClientSecret] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Create subscription on the backend
    if (selectedPlan.priceId) {
      fetch("/api/v2/stripe/create-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
            setError("Failed to initialize payment");
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
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      {
        payment_method: {
          card: cardElement,
        },
      }
    );

    if (stripeError) {
      setError(stripeError.message || "Payment failed");
      onError(stripeError.message || "Payment failed");
      setProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      onSuccess(paymentIntent.id);
    }
    
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border rounded-lg p-4 bg-gray-50">
        <h3 className="font-semibold text-lg mb-2">{selectedPlan.name}</h3>
        <p className="text-gray-600 mb-2">{selectedPlan.description}</p>
        <p className="text-2xl font-bold mb-4">
          ${(selectedPlan.amount / 100).toFixed(2)}/{selectedPlan.interval}
        </p>
        <ul className="space-y-1">
          {selectedPlan.features.map((feature, index) => (
            <li key={index} className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border rounded-lg p-4">
        <label className="block text-sm font-medium mb-2">
          Card Information
        </label>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "16px",
                color: "#424770",
                "::placeholder": {
                  color: "#aab7c4",
                },
              },
            },
          }}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
          processing || !stripe
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {processing ? "Processing..." : `Subscribe - $${(selectedPlan.amount / 100).toFixed(2)}/${selectedPlan.interval}`}
      </button>
    </form>
  );
}

export default function SubscriptionForm() {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [subscriptionComplete, setSubscriptionComplete] = useState(false);

  // Check if feature is enabled
  if (!isFeatureEnabled("STRIPE_SUBSCRIPTIONS")) {
    return (
      <div className="p-6 bg-gray-100 rounded-lg">
        <p className="text-gray-600">Subscription billing coming soon!</p>
      </div>
    );
  }

  // Check if Stripe is properly configured
  if (!stripePromise) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="text-lg font-semibold text-yellow-800 mb-2">Configuration Required</h3>
        <p className="text-yellow-700">
          Stripe is not configured. Please add your Stripe publishable key to the environment variables:
        </p>
        <code className="block mt-2 p-2 bg-yellow-100 rounded text-sm">
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
    logger.debug("Subscription successful:", { value: subscriptionId });
  };

  const handleError = (error: string) => {
    logger.error("Subscription error:", error);
  };

  if (subscriptionComplete) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <h2 className="text-2xl font-bold text-green-800 mb-2">
            Subscription Successful!
          </h2>
          <p className="text-green-600">
            Your subscription has been activated. Thank you for your purchase.
          </p>
          <button
            onClick={() => window.location.href = "/dashboard"}
            className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (showCheckout && selectedPlan) {
    return (
      <div className="max-w-2xl mx-auto p-6">
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
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">Unable to initialize payment form. Please check configuration.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Choose Your Plan</h1>
        <p className="text-gray-600">
          Select the plan that best fits your practice needs
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {SUBSCRIPTION_PLANS.map((plan: any) => (
          <div
            key={plan.id}
            className="border rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
            <p className="text-gray-600 mb-4">{plan.description}</p>
            <div className="mb-6">
              <span className="text-3xl font-bold">
                ${(plan.amount / 100).toFixed(2)}
              </span>
              <span className="text-gray-500">/{plan.interval}</span>
            </div>
            <ul className="space-y-2 mb-6">
              {plan.features.map((feature: string, index: number) => (
                <li key={index} className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSelectPlan(plan)}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Select Plan
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
