'use client';

import { useState } from 'react';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api/fetch';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceId: string;
  amount: number; // in cents
  interval: 'month' | 'year';
  features: string[];
}

const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'basic',
    name: 'Basic Plan',
    description: 'Essential features for individual practitioners',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC || '',
    amount: 4900,
    interval: 'month',
    features: ['Up to 50 patients', 'Basic prescriptions', 'Email support', 'Standard forms'],
  },
  {
    id: 'professional',
    name: 'Professional Plan',
    description: 'Advanced features for growing practices',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || '',
    amount: 9900,
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
    amount: 29900,
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

export interface SubscriptionFormProps {
  /** When omitted, authenticated patients use their session patient; staff must supply via API or extend UI. */
  patientId?: number;
  successUrl?: string;
  cancelUrl?: string;
}

export default function SubscriptionForm({
  patientId,
  successUrl,
  cancelUrl,
}: SubscriptionFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  if (!isFeatureEnabled('STRIPE_SUBSCRIPTIONS')) {
    return (
      <div className="rounded-lg bg-gray-100 p-6">
        <p className="text-gray-600">Subscription billing coming soon!</p>
      </div>
    );
  }

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (!plan.priceId) {
      setError('This plan is not configured (missing price ID).');
      return;
    }

    setError(null);
    setLoadingPlanId(plan.id);

    try {
      const res = await apiFetch('/api/stripe/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: plan.priceId,
          ...(patientId != null ? { patientId } : {}),
          ...(successUrl ? { successUrl } : {}),
          ...(cancelUrl ? { cancelUrl } : {}),
        }),
      });

      const data = (await res.json()) as { error?: string; url?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start checkout');
      }

      if (!data.url) {
        throw new Error('No checkout URL returned');
      }

      window.location.href = data.url;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      setError(message);
      logger.error('Subscription checkout error', new Error(message));
      setLoadingPlanId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-3xl font-bold">Choose Your Plan</h1>
        <p className="text-gray-600">Select the plan that best fits your practice needs</p>
      </div>

      {error && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-center text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <div key={plan.id} className="rounded-lg border p-6 transition-shadow hover:shadow-lg">
            <h3 className="mb-2 text-xl font-bold">{plan.name}</h3>
            <p className="mb-4 text-gray-600">{plan.description}</p>
            <div className="mb-6">
              <span className="text-3xl font-bold">${(plan.amount / 100).toFixed(2)}</span>
              <span className="text-gray-500">/{plan.interval}</span>
            </div>
            <ul className="mb-6 space-y-2">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => handleSelectPlan(plan)}
              disabled={loadingPlanId !== null}
              className={`w-full rounded-lg py-2 text-white transition-colors ${
                loadingPlanId !== null
                  ? 'cursor-not-allowed bg-gray-400'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loadingPlanId === plan.id ? 'Redirecting…' : 'Select Plan'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
