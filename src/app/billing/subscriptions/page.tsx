'use client';

import SubscriptionForm from '@/components/stripe/SubscriptionForm';
import { Feature } from '@/components/Feature';

export default function SubscriptionsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold text-gray-900">Upgrade Your Plan</h1>
            <p className="mt-4 text-xl text-gray-600">Choose the perfect plan for your practice</p>
          </div>

          <Feature
            feature="STRIPE_SUBSCRIPTIONS"
            fallback={
              <div className="mx-auto max-w-md">
                <div className="rounded-lg bg-white p-8 text-center shadow">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                    <svg
                      className="h-6 w-6 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-gray-900">
                    Subscription Billing Coming Soon!
                  </h3>
                  <p className="mb-6 text-gray-600">
                    We're working on bringing you flexible subscription plans with advanced
                    features.
                  </p>
                  <div className="mb-6 space-y-2 text-left">
                    <div className="flex items-start">
                      <span className="mr-2 text-green-500">✓</span>
                      <span className="text-sm text-gray-600">
                        Flexible monthly and annual billing
                      </span>
                    </div>
                    <div className="flex items-start">
                      <span className="mr-2 text-green-500">✓</span>
                      <span className="text-sm text-gray-600">
                        Instant plan upgrades and downgrades
                      </span>
                    </div>
                    <div className="flex items-start">
                      <span className="mr-2 text-green-500">✓</span>
                      <span className="text-sm text-gray-600">
                        Secure payment processing with Stripe
                      </span>
                    </div>
                    <div className="flex items-start">
                      <span className="mr-2 text-green-500">✓</span>
                      <span className="text-sm text-gray-600">Cancel anytime, no hidden fees</span>
                    </div>
                  </div>
                  <button
                    onClick={() => window.history.back()}
                    className="rounded-lg bg-gray-200 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-300"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            }
          >
            <SubscriptionForm />
          </Feature>

          {/* Benefits Section */}
          <div className="mt-16 rounded-lg bg-white p-8 shadow-sm">
            <h2 className="mb-8 text-center text-2xl font-bold">Why Choose Our Platform?</h2>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <svg
                    className="h-6 w-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-medium">HIPAA Compliant</h3>
                <p className="text-gray-600">
                  Your data is secured with industry-leading encryption and compliance standards.
                </p>
              </div>

              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <svg
                    className="h-6 w-6 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-medium">Lightning Fast</h3>
                <p className="text-gray-600">
                  Process prescriptions and manage patients with our optimized platform.
                </p>
              </div>

              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                  <svg
                    className="h-6 w-6 text-purple-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-medium">24/7 Support</h3>
                <p className="text-gray-600">
                  Get help when you need it with our dedicated support team.
                </p>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-12 rounded-lg bg-white p-8 shadow-sm">
            <h2 className="mb-8 text-center text-2xl font-bold">Frequently Asked Questions</h2>
            <div className="mx-auto max-w-3xl space-y-6">
              <div>
                <h3 className="mb-2 font-semibold">Can I change my plan anytime?</h3>
                <p className="text-gray-600">
                  Yes! You can upgrade or downgrade your plan at any time. Changes take effect
                  immediately, and we'll prorate any differences.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">What payment methods do you accept?</h3>
                <p className="text-gray-600">
                  We accept all major credit cards (Visa, MasterCard, American Express) and ACH bank
                  transfers through our secure Stripe integration.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Is there a free trial?</h3>
                <p className="text-gray-600">
                  Yes, we offer a 14-day free trial on Professional and Enterprise plans. No credit
                  card required to start.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Can I cancel my subscription?</h3>
                <p className="text-gray-600">
                  You can cancel your subscription at any time. You'll continue to have access until
                  the end of your current billing period.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
