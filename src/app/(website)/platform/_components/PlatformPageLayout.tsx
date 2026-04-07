'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, CheckCircle } from 'lucide-react';

interface PlatformPageLayoutProps {
  badge: string;
  title: string;
  highlightedWord: string;
  subtitle: string;
  features: { title: string; description: string }[];
  capabilities: string[];
  gradient: string;
  icon: LucideIcon;
  mockup: React.ReactNode;
}

export default function PlatformPageLayout({
  badge,
  title,
  highlightedWord,
  subtitle,
  features,
  capabilities,
  gradient,
  icon: Icon,
  mockup,
}: PlatformPageLayoutProps) {
  const heroRef = useRef<HTMLElement>(null);
  const featRef = useRef<HTMLElement>(null);
  const [heroVisible, setHeroVisible] = useState(false);
  const [featVisible, setFeatVisible] = useState(false);

  useEffect(() => {
    const els = [
      { el: heroRef.current, set: setHeroVisible },
      { el: featRef.current, set: setFeatVisible },
    ];
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const match = els.find((e) => e.el === entry.target);
            match?.set(true);
          }
        });
      },
      { threshold: 0.1 },
    );
    els.forEach((e) => e.el && obs.observe(e.el));
    return () => obs.disconnect();
  }, []);

  const parts = title.split(highlightedWord);

  return (
    <>
      {/* Hero */}
      <section
        ref={heroRef}
        className="relative overflow-hidden bg-[#efece7] pb-20 pt-32 sm:pb-28 sm:pt-40"
      >
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
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full blur-3xl transition-all duration-[2000ms]"
          style={{
            background: `linear-gradient(135deg, ${gradient.includes('4fa77e') ? 'rgba(79,167,126,0.1)' : gradient.includes('3b82f6') ? 'rgba(59,130,246,0.1)' : gradient.includes('8b5cf6') ? 'rgba(139,92,246,0.1)' : 'rgba(245,158,11,0.1)'}, transparent)`,
            transform: heroVisible ? 'scale(1)' : 'scale(0.6)',
            opacity: heroVisible ? 1 : 0,
          }}
        />

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <div
                className={`transition-all duration-500 ${heroVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}
              >
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#4fa77e]/20 bg-[#4fa77e]/10 px-4 py-1.5">
                  <Icon className="h-3.5 w-3.5 text-[#4fa77e]" />
                  <span className="text-xs font-semibold tracking-wide text-[#4fa77e]">
                    {badge}
                  </span>
                </div>
              </div>

              <h1
                className={`text-3xl font-bold leading-tight tracking-tight text-[#1f2933] transition-all duration-700 sm:text-4xl lg:text-5xl ${
                  heroVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                }`}
                style={{ transitionDelay: '100ms' }}
              >
                {parts[0]}
                <span className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
                  {highlightedWord}
                </span>
                {parts[1]}
              </h1>

              <p
                className={`mt-6 max-w-lg text-lg leading-relaxed text-[#1f2933]/60 transition-all duration-700 ${
                  heroVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                }`}
                style={{ transitionDelay: '200ms' }}
              >
                {subtitle}
              </p>

              <div
                className={`mt-8 flex flex-col gap-3 sm:flex-row transition-all duration-700 ${
                  heroVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                }`}
                style={{ transitionDelay: '350ms' }}
              >
                <a
                  href="/request-demo"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#4fa77e] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#4fa77e]/25 transition-all hover:bg-[#429b6f] hover:shadow-xl hover:-translate-y-0.5"
                >
                  Request a Demo
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/#features"
                  className="inline-flex items-center justify-center rounded-full border border-[#1f2933]/15 bg-white/60 px-8 py-3.5 text-base font-semibold text-[#1f2933] backdrop-blur-sm transition-all hover:bg-white hover:shadow-md hover:-translate-y-0.5"
                >
                  View All Products
                </a>
              </div>
            </div>

            {/* Mockup */}
            <div
              className={`flex justify-center transition-all duration-700 ${
                heroVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
              }`}
              style={{ transitionDelay: '300ms' }}
            >
              <div className={`relative rounded-2xl bg-gradient-to-br ${gradient} p-8 sm:p-10`}>
                <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.07]">
                  <div
                    className="h-full w-full rounded-2xl"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                      backgroundSize: '24px 24px',
                    }}
                  />
                </div>
                <div className="relative z-10">{mockup}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities list */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold text-[#1f2933] sm:text-3xl">
              Key Capabilities
            </h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap) => (
              <div
                key={cap}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-[#fafaf8] px-4 py-3 transition hover:border-[#4fa77e]/20 hover:shadow-sm"
              >
                <CheckCircle className="h-4 w-4 flex-shrink-0 text-[#4fa77e]" />
                <span className="text-sm font-medium text-[#1f2933]/80">{cap}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features deep-dive */}
      <section ref={featRef} className="bg-[#efece7] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <p className="text-sm font-semibold tracking-wide text-[#4fa77e]">DEEP DIVE</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1f2933] sm:text-4xl">
              Built for clinical excellence
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className={`group rounded-2xl border border-gray-100 bg-white p-8 transition-all duration-500 hover:border-[#4fa77e]/20 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#4fa77e]/5 ${
                  featVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white transition-transform group-hover:scale-110`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-[#1f2933]">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#1f2933]/55">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1f2933] sm:text-4xl">
            Ready to get started?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#1f2933]/55">
            Schedule a personalized demo and see how this fits into your clinic&apos;s workflow.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/request-demo"
              className="rounded-full bg-[#4fa77e] px-10 py-4 text-base font-semibold text-white shadow-lg shadow-[#4fa77e]/25 transition-all hover:bg-[#429b6f] hover:shadow-xl"
            >
              Request a Demo
            </a>
            <a
              href="mailto:contact@eonpro.io"
              className="rounded-full border border-[#1f2933]/15 bg-white px-10 py-4 text-base font-semibold text-[#1f2933] transition-all hover:border-[#1f2933]/25 hover:shadow-md"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
