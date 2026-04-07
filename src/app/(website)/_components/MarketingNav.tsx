'use client';

import { useState, useEffect, useRef } from 'react';
import { Menu, X, ChevronDown, Smartphone, Stethoscope, LayoutDashboard, Package, LogIn } from 'lucide-react';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';

const PLATFORM_ITEMS = [
  { label: 'Patient Portal', href: '/platform/patient-portal', icon: Smartphone, description: 'Mobile-first PWA for patients' },
  { label: 'Provider Dashboard', href: '/platform/provider-dashboard', icon: Stethoscope, description: 'AI-assisted clinical workspace' },
  { label: 'Clinic Admin', href: '/platform/clinic-admin', icon: LayoutDashboard, description: 'Operations & analytics hub' },
  { label: 'Pharmacy Integration', href: '/platform/pharmacy-integration', icon: Package, description: 'End-to-end Rx fulfillment' },
];

const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'Security', href: '/#security' },
  { label: 'FAQ', href: '/#faq' },
];

export default function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [mobilePlatformOpen, setMobilePlatformOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const isScrolled = window.scrollY > 20;
      setScrolled(isScrolled);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', isScrolled ? '#ffffff' : '#efece7');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPlatformOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

        <nav className="hidden items-center gap-6 lg:flex">
          {/* Platform dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setPlatformOpen(!platformOpen)}
              className="flex items-center gap-1 text-sm font-medium text-[#1f2933]/70 transition-colors hover:text-[#1f2933]"
            >
              Platform
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${platformOpen ? 'rotate-180' : ''}`} />
            </button>

            {platformOpen && (
              <div className="absolute left-1/2 top-full z-50 mt-3 w-[420px] -translate-x-1/2 rounded-2xl border border-gray-100 bg-white p-3 shadow-xl shadow-black/8">
                <div className="grid gap-1">
                  {PLATFORM_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        onClick={() => setPlatformOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[#4fa77e]/5"
                      >
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#4fa77e]/10 text-[#4fa77e]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#1f2933]">{item.label}</p>
                          <p className="text-xs text-[#1f2933]/50">{item.description}</p>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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
            href="https://app.eonpro.io"
            className="flex items-center gap-1.5 text-sm font-medium text-[#1f2933]/70 transition-colors hover:text-[#1f2933]"
          >
            <LogIn className="h-3.5 w-3.5" />
            Log In
          </a>

          <a
            href="/request-demo"
            className="rounded-full bg-[#4fa77e] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#429b6f] hover:shadow-md"
          >
            Request a Demo
          </a>
        </nav>

        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-[#1f2933] transition hover:bg-black/5 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[80%] max-w-sm transform bg-white transition-transform duration-300 lg:hidden ${
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
          {/* Platform collapsible */}
          <button
            onClick={() => setMobilePlatformOpen(!mobilePlatformOpen)}
            className="flex items-center justify-between rounded-lg px-4 py-3 text-base font-medium text-[#1f2933] transition hover:bg-gray-50"
          >
            Platform
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${mobilePlatformOpen ? 'rotate-180' : ''}`} />
          </button>

          {mobilePlatformOpen && (
            <div className="ml-4 flex flex-col gap-1 border-l-2 border-[#4fa77e]/20 pl-3">
              {PLATFORM_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-gray-50"
                  >
                    <Icon className="h-4 w-4 text-[#4fa77e]" />
                    <div>
                      <p className="text-sm font-medium text-[#1f2933]">{item.label}</p>
                      <p className="text-xs text-[#1f2933]/40">{item.description}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          )}

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
            href="https://app.eonpro.io"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-4 py-3 text-base font-medium text-[#1f2933] transition hover:bg-gray-50"
          >
            <LogIn className="h-4 w-4" />
            Log In
          </a>

          <a
            href="/request-demo"
            className="mt-4 rounded-full bg-[#4fa77e] px-6 py-3 text-center text-base font-semibold text-white transition hover:bg-[#429b6f]"
          >
            Request a Demo
          </a>
        </nav>
      </div>
    </header>
  );
}
