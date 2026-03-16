'use client';

import { useEffect, useState } from 'react';

interface ClinicLogo {
  name: string;
  subdomain: string;
  logoUrl: string | null;
}

const KNOWN_LOGOS: Record<string, string> = {
  overtime: 'https://static.wixstatic.com/shapes/c49a9b_5139736743794db7af38c583595f06fb.svg',
};

const FALLBACK_CLINICS: ClinicLogo[] = [
  { name: 'WellMedr', subdomain: 'wellmedr', logoUrl: null },
  { name: 'Overtime', subdomain: 'overtime', logoUrl: KNOWN_LOGOS.overtime },
  { name: 'EonMeds', subdomain: 'eonmeds', logoUrl: null },
  { name: 'Overnight', subdomain: 'overnight', logoUrl: null },
];

export default function ClinicLogosSlider() {
  const [clinics, setClinics] = useState<ClinicLogo[]>(FALLBACK_CLINICS);

  useEffect(() => {
    fetch('/api/public/clinic-logos')
      .then((r) => r.json())
      .then((data) => {
        if (data.clinics?.length) {
          const merged = data.clinics.map((c: ClinicLogo) => ({
            ...c,
            logoUrl: c.logoUrl || KNOWN_LOGOS[c.subdomain] || null,
          }));
          setClinics(merged);
        }
      })
      .catch(() => {});
  }, []);

  const items = [...clinics, ...clinics, ...clinics, ...clinics];

  return (
    <section className="border-y border-gray-200/60 bg-white py-12 sm:py-14">
      <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-[#1f2933]/30">
        Trusted by leading telehealth clinics
      </p>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-white to-transparent sm:w-40" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-white to-transparent sm:w-40" />

        <div className="flex animate-marquee items-center gap-12 sm:animate-marquee-desktop sm:gap-20">
          {items.map((clinic, i) => (
            <div key={`${clinic.subdomain}-${i}`} className="flex flex-shrink-0 items-center">
              {clinic.logoUrl ? (
                <img
                  src={clinic.logoUrl}
                  alt={clinic.name}
                  className="h-6 w-auto max-w-[128px] object-contain opacity-40 grayscale transition-all hover:opacity-80 hover:grayscale-0 sm:h-8 sm:max-w-[160px]"
                />
              ) : (
                <span className="select-none text-xl font-bold tracking-tight text-[#1f2933]/20 transition-colors hover:text-[#1f2933]/50 sm:text-2xl">
                  {clinic.name}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
