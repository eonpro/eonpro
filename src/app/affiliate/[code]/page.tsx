'use client';

/**
 * Affiliate Landing Page — OT Men's Brand Design
 *
 * Dynamic, personalized landing page for each affiliate at /affiliate/[code].
 * Matches the warm, premium, minimalist aesthetic of otmens.com:
 * - Warm cream background (#F5F0EB)
 * - Clean white cards with subtle shadows
 * - Warm gold/amber accents
 * - Dark CTA buttons
 * - OT brand logo and typography
 *
 * Features:
 * - Auto-tracks affiliate visits (click/link use)
 * - Personalized with affiliate's name
 * - Treatment CTAs link to intake flows with ?ref=CODE
 * - SEO-friendly with OG metadata (via layout.tsx)
 * - Mobile-optimized responsive design
 * - Graceful fallback for invalid codes
 */

import { useEffect, useState, useCallback, Suspense } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { useParams } from 'next/navigation';

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
// Brand Colors — OT Men's Health Palette
// ============================================================================

const BRAND = {
  cream: '#F5F0EB',
  creamDark: '#EDE7E0',
  white: '#FFFFFF',
  cardHover: '#FAF8F5',
  text: '#1A1A1A',
  textSecondary: '#6B6560',
  textMuted: '#9A948E',
  accent: '#C9A96E',
  accentDark: '#A68B55',
  border: '#E8E2DB',
  starGold: '#E8B84B',
  tagBg: '#F0EBE3',
} as const;

// ============================================================================
// Treatment Configuration
// ============================================================================

const TREATMENTS = [
  {
    id: 'bettersex',
    label: 'Better',
    keyword: 'Sex',
    image: 'https://static.wixstatic.com/media/c49a9b_45dbc9caf94447b587c2e999b7a8027c~mv2.png',
    keywordColor: '#771911',
    hoverBg: '#ea3942',
    url: 'https://bettersex.otmens.com/',
  },
  {
    id: 'optimize',
    label: 'Peptide',
    keyword: 'Therapies',
    image: 'https://static.wixstatic.com/media/c49a9b_87a5fa7b71ea4594939f319dcbaefd49~mv2.webp',
    keywordColor: '#b76e32',
    hoverBg: '#f1994e',
    url: 'https://optimize.otmens.com/',
  },
  {
    id: 'stayyoung',
    label: 'Stay',
    keyword: 'Young',
    image: 'https://static.wixstatic.com/media/c49a9b_7b4f8183a2d448af835cc73702cb8c55~mv2.png',
    keywordColor: '#3e83f7',
    hoverBg: '#204ac5',
    url: 'https://optimize.otmens.com/#logo',
  },
  {
    id: 'trt',
    label: 'Boost',
    keyword: 'Testosterone',
    image: 'https://static.wixstatic.com/media/c49a9b_c12e882be1064a3da6a50fad86c7f5bc~mv2.webp',
    keywordColor: '#295f3d',
    hoverBg: '#59c27b',
    url: 'https://trt.otmens.com/',
  },
  {
    id: 'weightloss',
    label: 'Lose',
    keyword: 'Weight',
    image: 'https://static.wixstatic.com/media/c49a9b_5b411cd2f37741709bb33a1bf383232b~mv2.webp',
    keywordColor: '#b39231',
    hoverBg: '#f7cc49',
    url: 'https://weightloss.otmens.com/',
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

const TESTIMONIALS = [
  {
    quote: 'Within the first month I felt stronger, more motivated, and more like myself again. The progress has been steady and real.',
    name: 'John M.',
    age: '26',
  },
  {
    quote: 'Better sleep, better recovery, and consistent improvement week after week. OT Men\'s Health helped me dial in the right protocol.',
    name: 'Kyle R.',
    age: '32',
  },
  {
    quote: 'For the first time in years, I feel balanced and in control of my health. My drive, mood, and performance improved.',
    name: 'Lucas P.',
    age: '36',
  },
];

// ============================================================================
// URL Builder
// ============================================================================

const BASE_INTAKE_URL = 'https://ot.eonpro.io';

function buildCtaUrl(path: string, refCode: string): string {
  return `${BASE_INTAKE_URL}${path}?ref=${encodeURIComponent(refCode)}`;
}

function buildTreatmentUrl(url: string, refCode: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('ref', refCode);
    return parsed.toString();
  } catch {
    return url;
  }
}

// ============================================================================
// Brand Assets — Wix Static CDN
// ============================================================================

const ASSETS = {
  logo: 'https://static.wixstatic.com/shapes/c49a9b_5139736743794db7af38c583595f06fb.svg',
  googleStars: 'https://static.wixstatic.com/shapes/c49a9b_ea75afc771f74c108742b781ab47157d.svg',
  press: {
    foxNews: 'https://static.wixstatic.com/shapes/c49a9b_0149dfbab1794e248ef9935d870d601d.svg',
    mensHealth: 'https://static.wixstatic.com/shapes/c49a9b_1a66cf45f53743d78a641eb67c07ead8.svg',
    gq: 'https://static.wixstatic.com/shapes/c49a9b_c6b0f67ae44f40ae88a76031173b81d8.svg',
    businessInsider: 'https://static.wixstatic.com/shapes/c49a9b_01fed7e538f94a4cbec406882e86dc91.svg',
    miamiHerald: 'https://static.wixstatic.com/shapes/c49a9b_77e5d41514994fa48ddd19ae6f399d71.svg',
    usaToday: 'https://www.vectorlogo.zone/logos/usatoday/usatoday-ar21~bgwhite.svg',
  },
} as const;

// ============================================================================
// Brand Logo Component
// ============================================================================

function OTLogo({ logoUrl, clinicName, size = 'default' }: { logoUrl?: string | null; clinicName?: string; size?: 'default' | 'small' }) {
  const src = logoUrl || ASSETS.logo;
  const height = size === 'small' ? 'h-7' : 'h-14';

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={clinicName || "OT Men's Health"}
      className={`${height} w-auto object-contain`}
    />
  );
}

// ============================================================================
// Star Rating Component (uses actual Google review SVG from otmens.com)
// ============================================================================

function GoogleStarRating() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ASSETS.googleStars}
      alt="Rated 4.9/5 on Google - based on 434 verified reviews"
      className="h-10 w-auto object-contain md:h-12"
    />
  );
}

/** Fallback star rating for testimonial cards */
function StarRating({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-0.5">
      {[...Array(count)].map((_, i) => (
        <svg
          key={i}
          className="h-4 w-4"
          fill={BRAND.starGold}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ============================================================================
// Arrow Icon
// ============================================================================

function ArrowRight({ color = BRAND.textMuted }: { color?: string }) {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke={color}
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      style={{ transition: 'stroke 0.35s ease-in-out' }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ============================================================================
// Infinite Scrolling Press Marquee
// ============================================================================

const PRESS_LOGOS = [
  { src: ASSETS.press.businessInsider, alt: 'Business Insider', height: 22 },
  { src: ASSETS.press.mensHealth, alt: "Men's Health", height: 42 },
  { src: ASSETS.press.gq, alt: 'GQ', height: 24 },
  { src: ASSETS.press.foxNews, alt: 'Fox News', height: 20 },
  { src: ASSETS.press.miamiHerald, alt: 'Miami Herald', height: 22 },
  { src: ASSETS.press.usaToday, alt: 'USA Today', height: 40 },
];

function PressMarquee() {
  // Duplicate logos for seamless infinite loop
  const logos = [...PRESS_LOGOS, ...PRESS_LOGOS];

  return (
    <div className="relative overflow-hidden">
      {/* Fade edges */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16"
        style={{ background: `linear-gradient(to right, ${BRAND.white}, transparent)` }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16"
        style={{ background: `linear-gradient(to left, ${BRAND.white}, transparent)` }}
      />

      {/* Scrolling track */}
      <div
        className="flex items-center gap-16"
        style={{
          animation: 'marquee 30s linear infinite',
          width: 'max-content',
        }}
      >
        {/* eslint-disable @next/next/no-img-element */}
        {logos.map((logo, i) => (
          <img
            key={`${logo.alt}-${i}`}
            src={logo.src}
            alt={logo.alt}
            className="w-auto flex-shrink-0 object-contain opacity-40 grayscale"
            style={{ minWidth: '80px', height: `${logo.height}px` }}
          />
        ))}
        {/* eslint-enable @next/next/no-img-element */}
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
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

  // Override body background to prevent corners showing the root bg color
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#000000';
    return () => { document.body.style.backgroundColor = prev; };
  }, []);

  // Fetch affiliate data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await apiFetch(`/api/affiliate/landing/${encodeURIComponent(code)}`);
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

  // ---- Loading State ----
  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: BRAND.cream }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: BRAND.accent, borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: BRAND.textMuted }}>Loading...</p>
        </div>
      </div>
    );
  }

  const affiliateName = data?.affiliateName || null;
  const refCode = data?.refCode || code;
  const isValid = data?.valid === true;
  const logoUrl = data?.logoUrl;
  const clinicName = data?.clinicName;

  return (
    <div className="min-h-screen font-sofia" style={{ backgroundColor: BRAND.cream, color: BRAND.text }}>

      {/* ================================================================ */}
      {/* Top Promo Banner — black bar with affiliate CTA */}
      {/* ================================================================ */}
      <div
        className="w-full py-2.5 text-center text-xs font-medium tracking-wide sm:text-sm"
        style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
      >
        {isValid && affiliateName ? (
          <span>
            Referred by <strong>{affiliateName}</strong> &mdash; Start your personalized intake today.{' '}
            <a
              href={buildCtaUrl('/trt', refCode)}
              className="underline underline-offset-2 transition-opacity hover:opacity-80"
              style={{ color: BRAND.accent }}
            >
              Get Started
            </a>
          </span>
        ) : (
          <span>
            Personalized treatments from board-certified providers.{' '}
            <a
              href={`${BASE_INTAKE_URL}/trt`}
              className="underline underline-offset-2 transition-opacity hover:opacity-80"
              style={{ color: BRAND.accent }}
            >
              Start Your Free Consultation
            </a>
          </span>
        )}
      </div>

      {/* ================================================================ */}
      {/* Header */}
      {/* ================================================================ */}
      <header style={{ backgroundColor: BRAND.white }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <OTLogo logoUrl={logoUrl} clinicName={clinicName} />
          <a
            href={isValid ? buildCtaUrl('/trt', refCode) : `${BASE_INTAKE_URL}/trt`}
            className="rounded-full px-6 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: BRAND.text, color: BRAND.white }}
          >
            Get Started
          </a>
        </div>
      </header>

      {/* ================================================================ */}
      {/* Hero Section — left-aligned, matching header width */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden" style={{ backgroundColor: BRAND.white }}>
        <div className="relative mx-auto max-w-6xl px-6 pb-12 pt-12 md:pb-16 md:pt-20">

          {/* Affiliate name as prominent heading */}
          {isValid && affiliateName && (
            <p
              className="mb-1 text-3xl font-bold leading-tight md:text-4xl lg:text-5xl"
              style={{ color: BRAND.accent }}
            >
              {affiliateName}&apos;s Pick
            </p>
          )}

          {/* Headline */}
          <h1 className="mb-6 text-3xl font-bold leading-tight tracking-tight md:text-4xl lg:text-5xl">
            for today&apos;s men
          </h1>

          {/* Trust indicators — left-aligned */}
          <div className="mb-6 flex flex-col items-start gap-2">
            <p className="text-sm font-medium" style={{ color: BRAND.textMuted }}>
              Trusted by 10,000+ men nationwide 🇺🇸
            </p>
            <GoogleStarRating />
          </div>

          {/* Subheadline */}
          <p
            className="mb-8 max-w-xl text-base leading-relaxed md:text-lg"
            style={{ color: BRAND.textSecondary }}
          >
            Personalized treatments from board-certified providers.
            Consultations, prescriptions, and ongoing support &mdash; all from home.
          </p>

        </div>
      </section>

      {/* ================================================================ */}
      {/* Treatment Cards — matching header width (max-w-6xl) */}
      {/* ================================================================ */}
      <section id="treatments" className="pb-16 pt-4 md:pb-24" style={{ backgroundColor: BRAND.white }}>
        <div className="mx-auto max-w-6xl px-6">

          {/* Top row: 3 cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {TREATMENTS.slice(0, 3).map((t) => (
              <TreatmentCard key={t.id} treatment={t} refCode={refCode} isValid={isValid} />
            ))}
          </div>

          {/* Bottom row: 2 cards, full width */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TREATMENTS.slice(3).map((t) => (
              <TreatmentCard key={t.id} treatment={t} refCode={refCode} isValid={isValid} />
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* "As Seen On" Press Bar — infinite scrolling marquee */}
      {/* ================================================================ */}
      <section style={{ backgroundColor: BRAND.white }}>
        <div className="px-6 pb-10 pt-10">
          <p
            className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: BRAND.textMuted }}
          >
            Treatments as seen on
          </p>
          <PressMarquee />
        </div>
      </section>

      {/* ================================================================ */}
      {/* How It Works */}
      {/* ================================================================ */}
      <section>
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
              How it <span style={{ color: BRAND.accent }}>works</span>
            </h2>
            <p style={{ color: BRAND.textSecondary }}>
              Three simple steps to a better you.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3 md:gap-6">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="rounded-2xl p-8 text-center"
                style={{ backgroundColor: BRAND.white }}
              >
                <div
                  className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
                  style={{ backgroundColor: BRAND.tagBg, color: BRAND.accent }}
                >
                  {step.number}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: BRAND.textSecondary }}>
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Testimonials */}
      {/* ================================================================ */}
      <section>
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-semibold" style={{ color: BRAND.accent }}>
              96% of members love their results
            </p>
            <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
              Trusted by <span style={{ color: BRAND.accent }}>thousands</span>
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="rounded-2xl p-7"
                style={{ backgroundColor: BRAND.white }}
              >
                <div className="mb-4">
                  <StarRating count={5} />
                </div>
                <p
                  className="mb-5 text-sm leading-relaxed"
                  style={{ color: BRAND.textSecondary }}
                >
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="text-sm font-semibold">
                  {t.name}{' '}
                  <span style={{ color: BRAND.textMuted }}>&middot; {t.age}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Providers / Trust Section */}
      {/* ================================================================ */}
      <section>
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <div className="grid items-center gap-12 md:grid-cols-2">
            {/* Left: Copy */}
            <div>
              <h2 className="mb-5 text-3xl font-bold tracking-tight md:text-4xl">
                Backed by{' '}
                <span style={{ color: BRAND.accent }}>world-class</span>{' '}
                providers
              </h2>
              <p className="mb-8 leading-relaxed" style={{ color: BRAND.textSecondary }}>
                Overtime&apos;s board-certified experts deliver high-quality
                healthcare at scale. Their combined clinical expertise guides
                innovative treatment plans and care delivery.
              </p>
              <div className="space-y-4">
                {[
                  'Board-certified with 15+ years experience',
                  'Specialized in men\'s health optimization',
                  'Thousands of patients treated nationwide',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <svg
                      className="mt-0.5 h-5 w-5 flex-shrink-0"
                      fill={BRAND.accent}
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm" style={{ color: BRAND.textSecondary }}>
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Stats card */}
            <div className="flex justify-center">
              <div className="w-full max-w-xs rounded-2xl p-10 text-center" style={{ backgroundColor: BRAND.white }}>
                <div className="mb-2 text-5xl font-bold" style={{ color: BRAND.accent }}>
                  96%
                </div>
                <p className="text-sm" style={{ color: BRAND.textSecondary }}>
                  of members love their results
                </p>
                <div className="my-6" style={{ borderTop: `1px solid ${BRAND.border}` }} />
                <div className="text-3xl font-bold" style={{ color: BRAND.text }}>
                  10,000+
                </div>
                <p className="text-sm" style={{ color: BRAND.textSecondary }}>
                  optimized members and counting
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Bottom CTA */}
      {/* ================================================================ */}
      <section style={{ backgroundColor: BRAND.creamDark }}>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center md:py-24">
          <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
            Ready to{' '}
            <span style={{ color: BRAND.accent }}>get started</span>?
          </h2>
          <p className="mb-8" style={{ color: BRAND.textSecondary }}>
            {isValid && affiliateName
              ? `Join ${affiliateName}'s community. Start your free consultation today.`
              : 'Start your free consultation today.'}
          </p>
          <a
            href={isValid ? buildCtaUrl('/trt', refCode) : `${BASE_INTAKE_URL}/trt`}
            className="inline-block rounded-full px-10 py-4 font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: BRAND.text, color: BRAND.white }}
          >
            Start Your Free Consultation
          </a>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Footer */}
      {/* ================================================================ */}
      <footer>
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <div className="flex items-center gap-4">
              <OTLogo logoUrl={logoUrl} clinicName={clinicName} size="small" />
              {isValid && (
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: BRAND.tagBg, color: BRAND.textMuted }}
                >
                  Partner: {refCode}
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: BRAND.textMuted }}>
              &copy; OT Men&apos;s Health. All rights reserved. Powered by EONPro
            </p>
          </div>
          <div
            className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:justify-start"
            style={{ color: BRAND.textMuted }}
          >
            <span>All treatments require a provider consultation.</span>
            <span>Results may vary.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// Treatment Card Component
// ============================================================================

function TreatmentCard({
  treatment,
  refCode,
  isValid,
}: {
  treatment: (typeof TREATMENTS)[number];
  refCode: string;
  isValid: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const href = isValid ? buildTreatmentUrl(treatment.url, refCode) : treatment.url;

  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-2xl px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: hovered ? treatment.hoverBg : '#f9f7f2',
        transition: 'background-color 0.35s ease-in-out, box-shadow 0.35s ease-in-out',
        boxShadow: hovered
          ? '0 8px 24px rgba(0,0,0,0.12)'
          : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Title */}
      <h3 className="text-lg font-medium leading-tight md:text-xl">
        <span
          style={{
            color: hovered ? '#FFFFFF' : BRAND.text,
            transition: 'color 0.35s ease-in-out',
          }}
        >
          {treatment.label}
        </span>{' '}
        <span style={{ color: treatment.keywordColor }}>
          {treatment.keyword}
        </span>
      </h3>

      {/* Image + Arrow */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={treatment.image}
          alt={`${treatment.label} ${treatment.keyword}`}
          className="h-12 w-12 object-contain sm:h-14 sm:w-14"
          style={{
            transform: hovered ? 'scale(1.15)' : 'scale(1)',
            transition: 'transform 0.35s ease-in-out',
          }}
        />
        <div
          style={{
            transform: hovered ? 'scale(0.8)' : 'scale(1)',
            transition: 'transform 0.35s ease-in-out',
          }}
        >
          <ArrowRight color={hovered ? '#FFFFFF' : BRAND.textMuted} />
        </div>
      </div>
    </a>
  );
}

// ============================================================================
// Page Export with Suspense Boundary
// ============================================================================

export default function AffiliateLandingPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ backgroundColor: BRAND.cream }}
        >
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: BRAND.accent, borderTopColor: 'transparent' }}
          />
        </div>
      }
    >
      <AffiliateLandingContent />
    </Suspense>
  );
}
