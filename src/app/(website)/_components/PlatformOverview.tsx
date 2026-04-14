'use client';

import { useEffect, useRef, useState } from 'react';
import { Video, Pill, HeartPulse, Users } from 'lucide-react';

const PILLARS = [
  {
    icon: Video,
    title: 'Telehealth',
    description: 'Zoom-integrated video visits with AI-assisted clinical documentation.',
  },
  {
    icon: Pill,
    title: 'Pharmacy',
    description: 'E-prescribing and nationwide fulfillment with real-time shipment tracking.',
  },
  {
    icon: HeartPulse,
    title: 'Patient Engagement',
    description: 'Progress tracking, gamification, wearable sync, and in-app messaging.',
  },
  {
    icon: Users,
    title: 'Multi-Clinic Ops',
    description: 'White-label support, per-clinic branding, role-based access, and analytics.',
  },
];

export default function PlatformOverview() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="platform" ref={ref} className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div
          className={`mx-auto max-w-3xl text-center transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <p className="text-sm font-semibold tracking-wide text-[#4fa77e]">
            POWERING QUALITY CARE AT SCALE
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1f2933] sm:text-4xl lg:text-5xl">
            Meet EonPro
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-[#1f2933]/60">
            EonPro vertically integrates the core parts of healthcare — bringing together nationwide
            telehealth, pharmacy, and patient engagement services on one platform. The result?
            It&apos;s easier for patients to access and providers to deliver high-quality care,
            thousands of times over.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className={`group rounded-2xl border border-gray-100 bg-[#fafaf8] p-8 transition-all duration-500 hover:-translate-y-1 hover:border-[#4fa77e]/20 hover:shadow-lg hover:shadow-[#4fa77e]/5 ${
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                }`}
                style={{ transitionDelay: `${200 + i * 120}ms` }}
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4fa77e]/10 text-[#4fa77e] transition-all duration-300 group-hover:scale-110 group-hover:bg-[#4fa77e] group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-[#1f2933]">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#1f2933]/50">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
