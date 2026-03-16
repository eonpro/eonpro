'use client';

import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';

const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Features', href: '#features' },
  { label: 'Security', href: '#security' },
  { label: 'FAQ', href: '#faq' },
];

export default function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-gray-200/60 bg-white/90 shadow-sm backdrop-blur-md'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <a href="/" className="flex-shrink-0">
          <img
            src={EONPRO_LOGO}
            alt="EonPro"
            className="h-8 w-auto sm:h-9"
          />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#1f2933]/70 transition-colors hover:text-[#1f2933]"
            >
              {link.label}
            </a>
          ))}
          <a
            href="mailto:contact@eonpro.io?subject=EonPro%20Demo%20Request"
            className="rounded-full bg-[#4fa77e] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#429b6f] hover:shadow-md"
          >
            Request a Demo
          </a>
        </nav>

        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-[#1f2933] transition hover:bg-black/5 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[80%] max-w-sm transform bg-white transition-transform duration-300 md:hidden ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <img src={EONPRO_LOGO} alt="EonPro" className="h-7 w-auto" />
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-4 py-3 text-base font-medium text-[#1f2933] transition hover:bg-gray-50"
            >
              {link.label}
            </a>
          ))}
          <a
            href="mailto:contact@eonpro.io?subject=EonPro%20Demo%20Request"
            className="mt-4 rounded-full bg-[#4fa77e] px-6 py-3 text-center text-base font-semibold text-white transition hover:bg-[#429b6f]"
          >
            Request a Demo
          </a>
        </nav>
      </div>
    </header>
  );
}
