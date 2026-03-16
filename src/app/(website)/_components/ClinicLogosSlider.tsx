'use client';

const CLINICS = [
  { name: 'WellMedr', style: 'font-bold tracking-tight' },
  { name: 'Overtime', style: 'font-bold tracking-wide uppercase' },
  { name: 'EonMeds', style: 'font-bold tracking-tight' },
  { name: 'Overnight', style: 'font-bold italic tracking-tight' },
];

const DUPLICATED = [...CLINICS, ...CLINICS, ...CLINICS, ...CLINICS];

export default function ClinicLogosSlider() {
  return (
    <section className="border-y border-gray-200/60 bg-white py-12 sm:py-14">
      <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-[#1f2933]/30">
        Trusted by leading telehealth clinics
      </p>

      <div className="relative overflow-hidden">
        {/* Fade edges */}
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-white to-transparent sm:w-40" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-white to-transparent sm:w-40" />

        <div className="flex animate-[marquee_25s_linear_infinite] items-center gap-16 sm:gap-24">
          {DUPLICATED.map((clinic, i) => (
            <span
              key={`${clinic.name}-${i}`}
              className={`flex-shrink-0 select-none text-2xl text-[#1f2933]/20 transition-colors hover:text-[#1f2933]/50 sm:text-3xl ${clinic.style}`}
            >
              {clinic.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
