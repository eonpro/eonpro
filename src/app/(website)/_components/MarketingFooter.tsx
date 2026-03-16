import { EONPRO_LOGO } from '@/lib/constants/brand-assets';

const FOOTER_LINKS = {
  Platform: [
    { label: 'Patient Portal', href: '#features' },
    { label: 'Provider Dashboard', href: '#features' },
    { label: 'Clinic Admin', href: '#features' },
    { label: 'Pharmacy Integration', href: '#features' },
  ],
  Company: [
    { label: 'About', href: '#platform' },
    { label: 'Security', href: '#security' },
    { label: 'Contact', href: 'mailto:contact@eonpro.io' },
  ],
  Legal: [
    { label: 'Terms of Service', href: '/terms-of-service' },
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'HIPAA Notice', href: '/hipaa-notice' },
  ],
};

export default function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#1f2933]/10 bg-[#1f2933]">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <img
              src={EONPRO_LOGO}
              alt="EonPro"
              className="mb-4 h-8 w-auto brightness-0 invert"
            />
            <p className="max-w-sm text-sm leading-relaxed text-white/60">
              The operating system for modern telehealth clinics. Vertically
              integrating telehealth, pharmacy, and patient engagement on one
              HIPAA-compliant platform.
            </p>
            <div className="mt-6 flex flex-col gap-1 text-sm text-white/50">
              <a href="mailto:support@eonpro.io" className="transition hover:text-white/80">
                support@eonpro.io
              </a>
              <a href="mailto:security@eonpro.io" className="transition hover:text-white/80">
                security@eonpro.io
              </a>
            </div>
          </div>

          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
                {heading}
              </h4>
              <ul className="flex flex-col gap-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-white/60 transition hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-white/40">
            {year} EonPro. All rights reserved.
          </p>
          <p className="text-xs text-white/40">
            HIPAA Compliant &middot; SOC 2 &middot; Encrypted at Rest
          </p>
        </div>
      </div>
    </footer>
  );
}
