'use client';

import { useEffect, useRef, useState } from 'react';
import { BRAND } from '@/lib/constants/brand-assets';

const PARTNERS = [
  {
    name: 'DosePost',
    logo: BRAND.partners.dosepost,
    url: 'https://dosepost.com',
    description: 'Pharmacy fulfillment & shipping',
  },
  {
    name: 'Lifefile',
    logo: BRAND.partners.lifefile,
    url: 'https://lifefile.io',
    description: 'Patient health records',
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
    <section ref={ref} className="bg-[#fafaf8] py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div
          className={`text-center transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f2933]/30">
            Partnered &amp; Integrated With
          </p>
        </div>

        <div
          className={`mt-10 flex flex-wrap items-center justify-center gap-10 sm:gap-16 lg:gap-24 transition-all duration-700 delay-200 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          {PARTNERS.map((partner, i) => (
            <a
              key={partner.name}
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-3 transition-all duration-300"
              style={{ transitionDelay: `${300 + i * 150}ms` }}
            >
              <div className="flex h-16 items-center justify-center rounded-xl border border-gray-200/60 bg-white px-8 py-3 shadow-sm transition-all duration-300 group-hover:border-[#4fa77e]/30 group-hover:shadow-md group-hover:shadow-[#4fa77e]/5 group-hover:-translate-y-0.5 sm:h-20 sm:px-10 sm:py-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partner.logo}
                  alt={partner.name}
                  className="h-8 w-auto max-w-[180px] object-contain sm:h-10 sm:max-w-[220px]"
                />
              </div>
              <span className="text-xs font-medium text-[#1f2933]/35 transition-colors group-hover:text-[#4fa77e]">
                {partner.description}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
