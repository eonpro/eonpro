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

function StatCounter({ label, target, suffix, prefix }: (typeof STATS)[number] & { visible: boolean }) {
  const count = useCountUp(target, 2200, true);
  return (
    <div className="text-center">
      <p className="text-3xl font-bold text-[#1f2933] sm:text-4xl lg:text-5xl">
        {prefix}{count.toLocaleString()}{suffix}
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
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-[#efece7] pb-20 pt-32 sm:pb-28 sm:pt-40"
    >
      {/* Subtle grid background */}
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

      {/* Gradient orb */}
      <div className="pointer-events-none absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full bg-[#4fa77e]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-[#4fa77e]/5 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <div
          className={`transition-all duration-700 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}
        >
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#4fa77e]/20 bg-[#4fa77e]/10 px-4 py-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#4fa77e]" />
            <span className="text-xs font-semibold tracking-wide text-[#4fa77e]">
              HIPAA-COMPLIANT PLATFORM
            </span>
          </div>

          <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight text-[#1f2933] sm:text-5xl lg:text-6xl">
            The operating system for{' '}
            <span className="bg-gradient-to-r from-[#4fa77e] to-[#3d8a65] bg-clip-text text-transparent">
              modern telehealth clinics
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#1f2933]/60 sm:text-xl">
            EonPro vertically integrates telehealth, e-prescribing, pharmacy
            fulfillment, and patient engagement on one platform — so you can
            focus on delivering quality care at scale.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="mailto:sales@eonpro.health?subject=EonPro%20Demo%20Request"
              className="rounded-full bg-[#4fa77e] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#4fa77e]/25 transition-all hover:bg-[#429b6f] hover:shadow-xl hover:shadow-[#4fa77e]/30"
            >
              Request a Demo
            </a>
            <a
              href="#platform"
              className="rounded-full border border-[#1f2933]/15 bg-white/60 px-8 py-3.5 text-base font-semibold text-[#1f2933] backdrop-blur-sm transition-all hover:bg-white hover:shadow-md"
            >
              Explore Platform
            </a>
          </div>
        </div>

        {/* Stats */}
        <div
          className={`mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3 transition-all duration-700 delay-300 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          {STATS.map((stat) => (
            <StatCounter key={stat.label} {...stat} visible={visible} />
          ))}
        </div>
      </div>
    </section>
  );
}
