'use client';

import { useEffect, useRef, useState } from 'react';

const STATS = [
  { label: 'Patients served', target: 50000, suffix: '+', prefix: '' },
  { label: 'Prescriptions fulfilled', target: 120000, suffix: '+', prefix: '' },
  { label: 'Telehealth sessions', target: 30000, suffix: '+', prefix: '' },
];

function useCountUp(target: number, duration = 2000, trigger = false) {
  const [value, setValue] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    if (!trigger) return;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      setValue(current);
      if (progress < 1) {
        ref.current = requestAnimationFrame(step);
      }
    };
    ref.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current);
  }, [target, duration, trigger]);

  return value;
}

function StatCounter({
  label,
  target,
  suffix,
  prefix,
  index,
  visible,
}: {
  label: string;
  target: number;
  suffix: string;
  prefix: string;
  index: number;
  visible: boolean;
}) {
  const count = useCountUp(target, 2200, visible);
  return (
    <div
      className={`text-center transition-all duration-700 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
      style={{ transitionDelay: `${400 + index * 150}ms` }}
    >
      <p className="text-3xl font-bold text-[#1f2933] sm:text-4xl lg:text-5xl">
        {prefix}
        {count.toLocaleString()}
        {suffix}
      </p>
      <p className="mt-2 text-sm font-medium text-[#1f2933]/50 sm:text-base">{label}</p>
    </div>
  );
}

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-[#efece7] pb-20 pt-32 sm:pb-28 sm:pt-40"
    >
      {/* Animated grid background */}
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

      {/* Animated gradient orbs */}
      <div
        className="pointer-events-none absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full bg-[#4fa77e]/10 blur-3xl transition-all duration-[2000ms]"
        style={{
          transform: visible ? 'scale(1) translate(0,0)' : 'scale(0.6) translate(80px,-80px)',
          opacity: visible ? 1 : 0,
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-[#4fa77e]/5 blur-3xl transition-all duration-[2500ms]"
        style={{
          transform: visible ? 'scale(1) translate(0,0)' : 'scale(0.6) translate(-60px,60px)',
          opacity: visible ? 1 : 0,
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 text-center">
        {/* Badge */}
        <div
          className={`transition-all duration-500 ${visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}
        >
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#4fa77e]/20 bg-[#4fa77e]/10 px-4 py-1.5">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4fa77e]" />
            <span className="text-xs font-semibold tracking-wide text-[#4fa77e]">
              HIPAA-COMPLIANT PLATFORM
            </span>
          </div>
        </div>

        {/* Headline */}
        <h1
          className={`mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight text-[#1f2933] transition-all duration-700 sm:text-5xl lg:text-6xl ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
          style={{ transitionDelay: '100ms' }}
        >
          The operating system for{' '}
          <span className="bg-gradient-to-r from-[#4fa77e] to-[#3d8a65] bg-clip-text text-transparent">
            modern telehealth clinics
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className={`mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#1f2933]/60 transition-all duration-700 sm:text-xl ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
          style={{ transitionDelay: '200ms' }}
        >
          EonPro vertically integrates telehealth, e-prescribing, pharmacy fulfillment, and patient
          engagement on one platform — so you can focus on delivering quality care at scale.
        </p>

        {/* CTAs */}
        <div
          className={`mt-10 flex flex-col items-center justify-center gap-4 transition-all duration-700 sm:flex-row ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
          style={{ transitionDelay: '350ms' }}
        >
          <a
            href="/request-demo"
            className="group relative rounded-full bg-[#4fa77e] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#4fa77e]/25 transition-all hover:-translate-y-0.5 hover:bg-[#429b6f] hover:shadow-xl hover:shadow-[#4fa77e]/30"
          >
            <span className="relative z-10">Request a Demo</span>
          </a>
          <a
            href="#platform"
            className="rounded-full border border-[#1f2933]/15 bg-white/60 px-8 py-3.5 text-base font-semibold text-[#1f2933] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
          >
            Explore Platform
          </a>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STATS.map((stat, i) => (
            <StatCounter key={stat.label} {...stat} index={i} visible={visible} />
          ))}
        </div>
      </div>
    </section>
  );
}
