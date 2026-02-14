'use client';

/**
 * Affiliate Landing Page
 *
 * Dynamic, personalized landing page for each affiliate at /affiliate/[code].
 * Similar to Function Health's referral pages with OT Men's branding.
 *
 * Features:
 * - Auto-tracks affiliate visits (click/link use)
 * - Personalized with affiliate's name
 * - Treatment CTAs link to intake flows with ?ref=CODE
 * - SEO-friendly with OG metadata
 * - Mobile-optimized design
 * - Graceful fallback for invalid codes
 */

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';

// ============================================================================
// Types
// ============================================================================

interface LandingData {
  valid: boolean;
  refCode: string;
  affiliateName: string | null;
  clinicId?: number;
  clinicName?: string;
  logoUrl?: string | null;
  branding?: {
    primaryColor: string;
    accentColor: string;
  };
}

// ============================================================================
// Treatment Configuration
// ============================================================================

const TREATMENTS = [
  {
    id: 'trt',
    title: 'Boost Testosterone',
    description: 'Reclaim your energy, strength, and drive with physician-guided TRT protocols.',
    icon: 'lightning',
    tag: 'Most Popular',
    path: '/trt',
  },
  {
    id: 'weightloss',
    title: 'Lose Weight',
    description: 'GLP-1 and GIP therapies that deliver real, sustainable results.',
    icon: 'scale',
    tag: 'Trending',
    path: '/weightloss',
  },
  {
    id: 'bettersex',
    title: 'Better Sex',
    description: 'Proven treatments to restore confidence and performance.',
    icon: 'heart',
    tag: null,
    path: '/bettersex',
  },
  {
    id: 'optimize',
    title: 'Peptide Therapy',
    description: 'Advanced peptide protocols for recovery, longevity, and optimization.',
    icon: 'beaker',
    tag: 'Advanced',
    path: '/optimize',
  },
  {
    id: 'baseline',
    title: 'Blood Panels',
    description: "You can't optimize what you don't measure. Know your levels.",
    icon: 'chart',
    tag: null,
    path: '/baseline',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Complete your intake',
    description: 'Answer a few quick questions about your health goals. Takes under 5 minutes.',
  },
  {
    number: '02',
    title: 'Provider review',
    description: 'A board-certified provider reviews your profile and creates a personalized plan.',
  },
  {
    number: '03',
    title: 'Treatment delivered',
    description: 'Receive your treatment shipped directly to your door in discreet packaging.',
  },
];

// ============================================================================
// Icons
// ============================================================================

function TreatmentIcon({ name }: { name: string }) {
  switch (name) {
    case 'lightning':
      return (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      );
    case 'scale':
      return (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
        </svg>
      );
    case 'heart':
      return (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      );
    case 'beaker':
      return (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
      );
    case 'chart':
      return (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      );
    default:
      return null;
  }
}

// ============================================================================
// URL Builder
// ============================================================================

const BASE_INTAKE_URL = 'https://ot.eonpro.io';

function buildCtaUrl(path: string, refCode: string): string {
  return `${BASE_INTAKE_URL}${path}?ref=${encodeURIComponent(refCode)}`;
}

// ============================================================================
// Main Component
// ============================================================================

function AffiliateLandingContent() {
  const params = useParams();
  const code = params.code as string;

  const [data, setData] = useState<LandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracked, setTracked] = useState(false);

  // Fetch affiliate data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/affiliate/landing/${encodeURIComponent(code)}`);
        const json = await res.json();
        setData(json);
      } catch {
        setData({ valid: false, refCode: code, affiliateName: null });
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [code]);

  // Track click once data is loaded and valid
  const trackClick = useCallback(async () => {
    if (tracked || !data?.valid) return;
    setTracked(true);
    try {
      const { autoTrack } = await import('@/lib/affiliate/tracking-client');
      await autoTrack({ refCode: data.refCode, touchType: 'CLICK' });
    } catch (err) {
      console.debug('[AffiliateLanding] Tracking error:', err);
    }
  }, [tracked, data]);

  useEffect(() => {
    if (data?.valid && !tracked) {
      trackClick();
    }
  }, [data, tracked, trackClick]);

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  const affiliateName = data?.affiliateName || null;
  const refCode = data?.refCode || code;
  const isValid = data?.valid === true;
  const logoUrl = data?.logoUrl;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* ================================================================ */}
      {/* Header */}
      {/* ================================================================ */}
      <header className="border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={data?.clinicName || 'OT Men\'s Health'}
                width={140}
                height={40}
                className="h-8 w-auto object-contain"
              />
            ) : (
              <span className="text-xl font-bold tracking-tight">
                OT <span className="text-emerald-400">Men&apos;s</span>
              </span>
            )}
          </div>
          <a
            href={isValid ? buildCtaUrl('/trt', refCode) : `${BASE_INTAKE_URL}/trt`}
            className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-400"
          >
            Get Started
          </a>
        </div>
      </header>

      {/* ================================================================ */}
      {/* Hero Section */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-600/10 blur-3xl" />
        <div className="pointer-events-none absolute -top-20 right-0 h-[300px] w-[400px] rounded-full bg-cyan-600/5 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-6 pb-16 pt-20 text-center md:pb-24 md:pt-28">
          {/* Personalization badge */}
          {isValid && affiliateName && (
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-5 py-2.5">
              <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-medium text-emerald-300">
                Recommended by {affiliateName}
              </span>
            </div>
          )}

          {/* Headline */}
          <h1 className="mb-6 text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl lg:text-7xl">
            {isValid && affiliateName ? (
              <>
                {affiliateName}&apos;s
                <br />
                <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
                  exclusive offer
                </span>
              </>
            ) : (
              <>
                Optimized health
                <br />
                <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
                  for today&apos;s men
                </span>
              </>
            )}
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-400 md:text-xl">
            Personalized treatments from board-certified providers.
            Consultations, prescriptions, and ongoing support &mdash; all from home.
          </p>

          {/* CTA */}
          <div className="mb-14 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={isValid ? buildCtaUrl('/trt', refCode) : `${BASE_INTAKE_URL}/trt`}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-8 py-4 text-center font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:shadow-emerald-500/40 sm:w-auto"
            >
              Start Your Free Consultation
            </a>
            <a
              href="#treatments"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-8 py-4 text-center font-semibold text-white transition-all hover:bg-white/10 sm:w-auto"
            >
              Browse Treatments
            </a>
          </div>

          {/* Trust bar */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Board Certified Providers
            </span>
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              HIPAA Compliant
            </span>
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              10,000+ Members
            </span>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Treatment Cards */}
      {/* ================================================================ */}
      <section id="treatments" className="border-t border-white/5 bg-[#0d0d14]">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Choose your <span className="text-emerald-400">treatment</span>
            </h2>
            <p className="mx-auto max-w-xl text-slate-400">
              Select the treatment that fits your goals. Each starts with a free provider consultation.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TREATMENTS.map((treatment) => (
              <a
                key={treatment.id}
                href={isValid ? buildCtaUrl(treatment.path, refCode) : `${BASE_INTAKE_URL}${treatment.path}`}
                className="group relative flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition-all hover:border-emerald-500/30 hover:bg-white/[0.04]"
              >
                {treatment.tag && (
                  <span className="absolute right-4 top-4 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                    {treatment.tag}
                  </span>
                )}
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
                  <TreatmentIcon name={treatment.icon} />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{treatment.title}</h3>
                <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-400">{treatment.description}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-400 transition-all group-hover:gap-2">
                  Get Started
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* How It Works */}
      {/* ================================================================ */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              How it <span className="text-emerald-400">works</span>
            </h2>
            <p className="text-slate-400">Three simple steps to a better you.</p>
          </div>

          <div className="grid gap-12 md:grid-cols-3 md:gap-8">
            {STEPS.map((step) => (
              <div key={step.number} className="text-center md:text-left">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-lg font-bold text-emerald-400">
                  {step.number}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Social Proof */}
      {/* ================================================================ */}
      <section className="border-t border-white/5 bg-[#0d0d14]">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Trusted by <span className="text-emerald-400">thousands</span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                quote: 'Within the first month I felt stronger, more motivated, and more like myself again.',
                name: 'John M.',
                age: '26',
              },
              {
                quote: 'Better sleep, better recovery, and consistent improvement week after week.',
                name: 'Kyle R.',
                age: '32',
              },
              {
                quote: 'For the first time in years, I feel balanced and in control of my health.',
                name: 'Lucas P.',
                age: '36',
              },
            ].map((testimonial, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-6"
              >
                <div className="mb-4 flex gap-1">
                  {[...Array(5)].map((_, j) => (
                    <svg key={j} className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="mb-4 text-sm leading-relaxed text-slate-300">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <p className="text-sm font-medium text-slate-500">
                  {testimonial.name} &middot; {testimonial.age}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Backed By Section */}
      {/* ================================================================ */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <h2 className="mb-6 text-3xl font-bold md:text-4xl">
                Backed by <span className="text-emerald-400">world-class</span> providers
              </h2>
              <p className="mb-8 text-slate-400 leading-relaxed">
                Overtime&apos;s board-certified experts deliver high-quality healthcare at scale.
                Their combined clinical expertise guides innovative treatment plans.
              </p>
              <div className="space-y-4">
                {[
                  'Board-certified with 15+ years experience',
                  'Specialized in men\'s health optimization',
                  'Thousands of patients treated nationwide',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-center">
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
                <div className="mb-3 text-5xl font-bold text-emerald-400">96%</div>
                <p className="text-sm text-slate-400">of members love their results</p>
                <div className="mt-6 border-t border-white/5 pt-6">
                  <div className="text-3xl font-bold">10,000+</div>
                  <p className="text-sm text-slate-400">optimized members and counting</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Bottom CTA */}
      {/* ================================================================ */}
      <section className="border-t border-white/5 bg-gradient-to-b from-[#0d0d14] to-[#0a0a0f]">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-28">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Ready to <span className="text-emerald-400">get started</span>?
          </h2>
          <p className="mb-8 text-slate-400">
            {isValid && affiliateName
              ? `Join ${affiliateName}'s community. Start your free consultation today.`
              : 'Start your free consultation today.'}
          </p>
          <a
            href={isValid ? buildCtaUrl('/trt', refCode) : `${BASE_INTAKE_URL}/trt`}
            className="inline-block rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-10 py-4 font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:shadow-emerald-500/40"
          >
            Start Your Free Consultation
          </a>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Footer */}
      {/* ================================================================ */}
      <footer className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col items-center justify-between gap-4 text-center text-xs text-slate-600 sm:flex-row sm:text-left">
            <p>
              {isValid && (
                <span className="mr-3 rounded bg-white/5 px-2 py-1 text-slate-500">
                  Partner code: {refCode}
                </span>
              )}
              {data?.clinicName || 'OT Men\'s Health'}
            </p>
            <p>
              All treatments require a provider consultation. Results may vary.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// Page Export with Suspense Boundary
// ============================================================================

export default function AffiliateLandingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <AffiliateLandingContent />
    </Suspense>
  );
}
