'use client';

import { useEffect, useRef, useState } from 'react';
import { BRAND } from '@/lib/constants/brand-assets';

const PARTNERS = [
  {
    name: 'DosePost',
    logo: BRAND.partners.dosepost,
    url: 'https://dosepost.com',
  },
  {
    name: 'Lifefile',
    logo: BRAND.partners.lifefile,
    url: 'https://lifefile.io',
  },
];

export default function PartnersSection() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-6">
        <p
          className={`mb-8 text-center text-xs font-semibold uppercase tracking-widest text-[#1f2933]/30 transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          Partnered &amp; Integrated With
        </p>

        <div
          className={`flex flex-wrap items-center justify-center gap-12 sm:gap-20 lg:gap-28 transition-all duration-700 delay-200 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          {PARTNERS.map((partner, i) => (
            <a
              key={partner.name}
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-40 transition-opacity duration-300 hover:opacity-80"
              style={{ transitionDelay: `${300 + i * 150}ms` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={partner.logo}
                alt={partner.name}
                className="h-8 w-auto max-w-[180px] object-contain sm:h-10 sm:max-w-[220px]"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
