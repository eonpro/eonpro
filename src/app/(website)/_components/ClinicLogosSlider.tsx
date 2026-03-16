'use client';

import { useEffect, useState } from 'react';

interface ClinicLogo {
  name: string;
  subdomain: string;
  logoUrl: string | null;
}

const FALLBACK_CLINICS = [
  { name: 'WellMedr', subdomain: 'wellmedr', logoUrl: null },
  { name: 'Overtime', subdomain: 'overtime', logoUrl: null },
  { name: 'EonMeds', subdomain: 'eonmeds', logoUrl: null },
  { name: 'Overnight', subdomain: 'overnight', logoUrl: null },
];

export default function ClinicLogosSlider() {
  const [clinics, setClinics] = useState<ClinicLogo[]>(FALLBACK_CLINICS);

  useEffect(() => {
    fetch('/api/public/clinic-logos')
      .then((r) => r.json())
      .then((data) => {
        if (data.clinics?.length) setClinics(data.clinics);
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

        <div className="flex animate-marquee items-center gap-16 sm:gap-24">
          {items.map((clinic, i) => (
            <div key={`${clinic.subdomain}-${i}`} className="flex flex-shrink-0 items-center">
              {clinic.logoUrl ? (
                <img
                  src={clinic.logoUrl}
                  alt={clinic.name}
                  className="h-8 w-auto max-w-[160px] object-contain opacity-40 grayscale transition-all hover:opacity-80 hover:grayscale-0 sm:h-10 sm:max-w-[200px]"
                />
              ) : (
                <span className="select-none text-2xl font-bold tracking-tight text-[#1f2933]/20 transition-colors hover:text-[#1f2933]/50 sm:text-3xl">
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
