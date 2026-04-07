'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, ArrowRight, Building2, Send } from 'lucide-react';

const EMR_OPTIONS = [
  'Epic',
  'Cerner (Oracle Health)',
  'Athenahealth',
  'eClinicalWorks',
  'NextGen Healthcare',
  'Allscripts',
  'DrChrono',
  'Practice Fusion',
  'Kareo',
  'AdvancedMD',
  'ModMed',
  'Amazing Charts',
  'Greenway Health',
  'CureMD',
  'Other',
  'None / Starting Fresh',
];

const RX_RANGES = [
  'Under 100',
  '100 – 500',
  '500 – 1,000',
  '1,000 – 5,000',
  '5,000+',
];

const demoSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().min(7, 'Please enter a valid phone number').max(20),
  practiceName: z.string().min(1, 'Practice name is required').max(200),
  prescriptionsPerMonth: z.string().min(1, 'Please select a range'),
  currentEmr: z.string().min(1, 'Please select your current EMR'),
});

type DemoFormData = z.infer<typeof demoSchema>;

export default function RequestDemoPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DemoFormData>({
    resolver: zodResolver(demoSchema),
  });

  const onSubmit = async (data: DemoFormData) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong. Please try again.');
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-[#efece7] px-6 pt-24">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#4fa77e]/10">
            <CheckCircle className="h-10 w-10 text-[#4fa77e]" />
          </div>
          <h1 className="text-3xl font-bold text-[#1f2933] sm:text-4xl">
            Thank you!
          </h1>
          <p className="mt-4 text-lg text-[#1f2933]/60">
            We&apos;ve received your demo request. A member of our team will
            reach out within 24 hours to schedule a personalized walkthrough of
            EonPro.
          </p>
          <a
            href="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#4fa77e] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#4fa77e]/25 transition-all hover:bg-[#429b6f] hover:shadow-xl"
          >
            Back to Home
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen bg-[#efece7] pb-20 pt-32 sm:pt-40">
      {/* Background elements */}
      <div className="pointer-events-none absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full bg-[#4fa77e]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-[#4fa77e]/5 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              'linear-gradient(#1f2933 1px, transparent 1px), linear-gradient(90deg, #1f2933 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Left column - Copy */}
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#4fa77e]/20 bg-[#4fa77e]/10 px-4 py-1.5">
              <Building2 className="h-3.5 w-3.5 text-[#4fa77e]" />
              <span className="text-xs font-semibold tracking-wide text-[#4fa77e]">
                FOR CLINICS &amp; PRACTICES
              </span>
            </div>

            <h1 className="text-3xl font-bold leading-tight tracking-tight text-[#1f2933] sm:text-4xl lg:text-5xl">
              See EonPro{' '}
              <span className="bg-gradient-to-r from-[#4fa77e] to-[#3d8a65] bg-clip-text text-transparent">
                in action
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#1f2933]/60">
              Schedule a personalized demo and discover how EonPro can
              streamline your telehealth operations, pharmacy fulfillment, and
              patient engagement — all on one HIPAA-compliant platform.
            </p>

            <div className="mt-10 space-y-4">
              {[
                'Personalized walkthrough tailored to your practice',
                'See telehealth, e-prescribing, and pharmacy in action',
                'Learn about white-label branding and multi-clinic support',
                'No commitment required — just a conversation',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-[#4fa77e]" />
                  <span className="text-sm text-[#1f2933]/70">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column - Form */}
          <div className="rounded-2xl border border-gray-200/60 bg-white p-8 shadow-xl shadow-black/5 sm:p-10">
            <h2 className="text-xl font-bold text-[#1f2933]">
              Request a Demo
            </h2>
            <p className="mt-1 text-sm text-[#1f2933]/50">
              Fill out the form and we&apos;ll be in touch shortly.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
              {/* Name row */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-[#1f2933]">
                    First Name *
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    {...register('firstName')}
                    className="w-full rounded-lg border border-gray-200 bg-[#fafaf8] px-4 py-2.5 text-sm text-[#1f2933] outline-none transition focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]/20"
                    placeholder="John"
                  />
                  {errors.firstName && (
                    <p className="mt-1 text-xs text-red-500">{errors.firstName.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-[#1f2933]">
                    Last Name *
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    {...register('lastName')}
                    className="w-full rounded-lg border border-gray-200 bg-[#fafaf8] px-4 py-2.5 text-sm text-[#1f2933] outline-none transition focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]/20"
                    placeholder="Doe"
                  />
                  {errors.lastName && (
                    <p className="mt-1 text-xs text-red-500">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              {/* Practice */}
              <div>
                <label htmlFor="practiceName" className="mb-1.5 block text-sm font-medium text-[#1f2933]">
                  Practice / Clinic Name *
                </label>
                <input
                  id="practiceName"
                  type="text"
                  autoComplete="organization"
                  {...register('practiceName')}
                  className="w-full rounded-lg border border-gray-200 bg-[#fafaf8] px-4 py-2.5 text-sm text-[#1f2933] outline-none transition focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]/20"
                  placeholder="Acme Health Clinic"
                />
                {errors.practiceName && (
                  <p className="mt-1 text-xs text-red-500">{errors.practiceName.message}</p>
                )}
              </div>

              {/* Email + Phone */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#1f2933]">
                    Email *
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    {...register('email')}
                    className="w-full rounded-lg border border-gray-200 bg-[#fafaf8] px-4 py-2.5 text-sm text-[#1f2933] outline-none transition focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]/20"
                    placeholder="john@clinic.com"
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-[#1f2933]">
                    Phone Number *
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    {...register('phone')}
                    className="w-full rounded-lg border border-gray-200 bg-[#fafaf8] px-4 py-2.5 text-sm text-[#1f2933] outline-none transition focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]/20"
                    placeholder="(555) 123-4567"
                  />
                  {errors.phone && (
                    <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>
                  )}
                </div>
              </div>

              {/* Prescriptions per month */}
              <div>
                <label htmlFor="prescriptionsPerMonth" className="mb-1.5 block text-sm font-medium text-[#1f2933]">
                  Prescriptions per Month *
                </label>
                <select
                  id="prescriptionsPerMonth"
                  {...register('prescriptionsPerMonth')}
                  className="w-full rounded-lg border border-gray-200 bg-[#fafaf8] px-4 py-2.5 text-sm text-[#1f2933] outline-none transition focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]/20"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a range
                  </option>
                  {RX_RANGES.map((range) => (
                    <option key={range} value={range}>
                      {range}
                    </option>
                  ))}
                </select>
                {errors.prescriptionsPerMonth && (
                  <p className="mt-1 text-xs text-red-500">{errors.prescriptionsPerMonth.message}</p>
                )}
              </div>

              {/* Current EMR */}
              <div>
                <label htmlFor="currentEmr" className="mb-1.5 block text-sm font-medium text-[#1f2933]">
                  Current EMR *
                </label>
                <select
                  id="currentEmr"
                  {...register('currentEmr')}
                  className="w-full rounded-lg border border-gray-200 bg-[#fafaf8] px-4 py-2.5 text-sm text-[#1f2933] outline-none transition focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]/20"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select your EMR
                  </option>
                  {EMR_OPTIONS.map((emr) => (
                    <option key={emr} value={emr}>
                      {emr}
                    </option>
                  ))}
                </select>
                {errors.currentEmr && (
                  <p className="mt-1 text-xs text-red-500">{errors.currentEmr.message}</p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4fa77e] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#4fa77e]/25 transition-all hover:bg-[#429b6f] hover:shadow-xl hover:shadow-[#4fa77e]/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Request Demo
                  </>
                )}
              </button>

              <p className="text-center text-xs text-[#1f2933]/40">
                By submitting, you agree to our{' '}
                <a href="/privacy-policy" className="underline hover:text-[#4fa77e]">
                  Privacy Policy
                </a>
                . We&apos;ll never share your information with third parties.
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
