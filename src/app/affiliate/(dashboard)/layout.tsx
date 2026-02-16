'use client';

/**
 * Affiliate Dashboard Layout
 *
 * Mobile-first bottom navigation with elegant transitions.
 * Fetches clinic branding from /api/affiliate/branding and applies it
 * via CSS custom properties (colors) and React Context (non-CSS data).
 */

import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ReactNode, useEffect, useState, useMemo } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import {
  AffiliateBranding,
  BrandingProvider,
  brandingToCssVars,
} from './branding-context';

interface NavItem {
  href: string;
  label: string;
  /** Feature flag key -- if set, item is hidden when that flag is false */
  featureFlag?: keyof AffiliateBranding['features'];
  icon: (active: boolean) => ReactNode;
}

const allNavItems: NavItem[] = [
  {
    href: '/affiliate',
    label: 'Home',
    icon: (active) => (
      <svg
        className="h-6 w-6"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 0 : 1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    href: '/affiliate/earnings',
    label: 'Earnings',
    featureFlag: 'showPayoutHistory',
    icon: (active) => (
      <svg
        className="h-6 w-6"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 0 : 1.5}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    href: '/affiliate/links',
    label: 'Links',
    featureFlag: 'showRefCodeManager',
    icon: (active) => (
      <svg
        className="h-6 w-6"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 0 : 1.5}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
        />
      </svg>
    ),
  },
  {
    href: '/affiliate/leaderboard',
    label: 'Rank',
    icon: (active) => (
      <svg
        className="h-6 w-6"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 0 : 1.5}
          d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
        />
      </svg>
    ),
  },
  {
    href: '/affiliate/account',
    label: 'Account',
    icon: (active) => (
      <svg
        className="h-6 w-6"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={active ? 0 : 1.5}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    ),
  },
];

export default function AffiliateDashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [branding, setBranding] = useState<AffiliateBranding | null>(null);
  const [refLink, setRefLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // 1. Check auth
      try {
        const res = await apiFetch('/api/affiliate/auth/me', {
          credentials: 'include',
        });
        if (!res.ok) {
          router.push(`/affiliate/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
        if (!cancelled) setIsAuthed(true);
      } catch {
        router.push('/affiliate/login');
        return;
      }

      // 2. Fetch clinic branding -- two strategies for resilience
      let brandingData: AffiliateBranding | null = null;

      // Strategy A: public clinic/resolve endpoint (always works, no auth needed)
      try {
        const domain = window.location.hostname;
        const resolveRes = await fetch(
          `/api/clinic/resolve?domain=${encodeURIComponent(domain)}`,
          { cache: 'no-store' }
        );
        if (resolveRes.ok && !cancelled) {
          const clinic = await resolveRes.json();
          if (clinic.clinicId) {
            brandingData = {
              clinicId: clinic.clinicId,
              clinicName: clinic.name || '',
              affiliateName: 'Partner',
              logoUrl: clinic.branding?.logoUrl || null,
              faviconUrl: clinic.branding?.faviconUrl || null,
              primaryColor: clinic.branding?.primaryColor || '#4fa77e',
              secondaryColor: clinic.branding?.secondaryColor || '#3B82F6',
              accentColor: clinic.branding?.accentColor || '#d3f931',
              customCss: null,
              features: {
                showPerformanceChart: true,
                showRefCodeManager: true,
                showPayoutHistory: true,
                showResources: true,
              },
              supportEmail: clinic.contact?.supportEmail || null,
              supportPhone: clinic.contact?.phone || null,
              resources: [],
            };
          }
        }
      } catch (err) {
        console.warn('[Affiliate Layout] clinic/resolve fallback failed:', err);
      }

      // Strategy B: authenticated affiliate branding endpoint (richer data)
      // Pass the Bearer token explicitly from localStorage -- the original portal
      // did this and it worked. The cookie-only approach fails because apiFetch
      // skips the Authorization header for same-origin requests, and the clinic
      // middleware skips /api/affiliate routes (PUBLIC_ROUTES), so x-clinic-id
      // is never set and the tenant-scoped Prisma query returns null.
      try {
        const token =
          typeof window !== 'undefined'
            ? localStorage.getItem('auth-token') ||
              localStorage.getItem('affiliate-token') ||
              localStorage.getItem('access_token')
            : null;
        const brandingRes = await apiFetch('/api/affiliate/branding', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        });
        if (brandingRes.ok && !cancelled) {
          const data = await brandingRes.json();
          brandingData = data;
        } else {
          console.warn('[Affiliate Layout] /api/affiliate/branding returned', brandingRes.status);
        }
      } catch (err) {
        console.warn('[Affiliate Layout] /api/affiliate/branding error:', err);
      }

      // 3. Fetch default ref code for quick-copy link in sidebar
      try {
        const refRes = await apiFetch('/api/affiliate/ref-codes', { credentials: 'include' });
        if (refRes.ok && !cancelled) {
          const refData = await refRes.json();
          const defaultCode =
            refData.refCodes?.find((c: { isDefault: boolean }) => c.isDefault) ||
            refData.refCodes?.[0];
          if (defaultCode && refData.baseUrl) {
            setRefLink(`${refData.baseUrl}/affiliate/${defaultCode.code}`);
          }
        }
      } catch {
        // Non-critical -- sidebar link just won't show
      }

      // Apply whichever branding we have
      if (brandingData && !cancelled) {
        setBranding(brandingData);

        if (brandingData.customCss) {
          let styleEl = document.getElementById('affiliate-custom-css');
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'affiliate-custom-css';
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = brandingData.customCss;
        }

        if (brandingData.faviconUrl) {
          const link =
            (document.querySelector("link[rel*='icon']") as HTMLLinkElement) ||
            document.createElement('link');
          link.type = 'image/x-icon';
          link.rel = 'shortcut icon';
          link.href = brandingData.faviconUrl;
          document.head.appendChild(link);
        }

        if (brandingData.clinicName) {
          document.title = `Partner Portal | ${brandingData.clinicName}`;
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute CSS custom properties from branding
  const cssVars = useMemo(() => brandingToCssVars(branding), [branding]);

  // Filter nav items based on feature flags
  const navItems = useMemo(() => {
    if (!branding) return allNavItems;
    return allNavItems.filter((item) => {
      if (!item.featureFlag) return true;
      return branding.features[item.featureFlag] !== false;
    });
  }, [branding]);

  if (isAuthed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  const isActive = (href: string) => {
    if (href === '/affiliate') return pathname === '/affiliate';
    return pathname.startsWith(href);
  };

  const primaryColor = branding?.primaryColor || '#111827';
  const portalName = branding?.clinicName ? `${branding.clinicName} Partners` : 'Partner Portal';

  const copyRefLink = async () => {
    if (!refLink) return;
    try {
      await navigator.clipboard.writeText(refLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = refLink;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Set body background to match layout so no white edges bleed through
  useEffect(() => {
    document.documentElement.style.backgroundColor = '#F9FAFB';
    document.body.style.backgroundColor = '#F9FAFB';
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

  return (
    <BrandingProvider branding={branding}>
      <div
        className="min-h-screen pb-20 md:pb-0 md:pl-64"
        style={{ backgroundColor: 'var(--brand-bg)', ...cssVars } as React.CSSProperties}
      >
        {/* Desktop Sidebar */}
        <aside className="fixed bottom-0 left-0 top-0 hidden w-64 flex-col border-r border-gray-100 bg-white md:flex">
          <div className="border-b border-gray-100 p-6">
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.clinicName}
                className="h-8 max-w-[180px] object-contain"
              />
            ) : (
              <h1 className="text-xl font-semibold text-gray-900">{portalName}</h1>
            )}
          </div>
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    active ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={active ? { backgroundColor: primaryColor } : undefined}
                >
                  {item.icon(active)}
                  <span className="font-medium">{item.label}</span>
                </a>
              );
            })}
          </nav>

          {/* Quick-copy referral link */}
          {refLink && (
            <div className="border-t border-gray-100 px-4 py-3">
              <button
                onClick={copyRefLink}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors"
                style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}
              >
                {copiedLink ? (
                  <svg className="h-5 w-5 flex-shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                <span className="truncate">{copiedLink ? 'Copied!' : 'Copy Referral Link'}</span>
              </button>
            </div>
          )}

          <div className="border-t border-gray-100 p-4">
            <a
              href="/affiliate/help"
              className="flex items-center gap-3 px-4 py-3 text-gray-500 transition-colors hover:text-gray-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Help & Support</span>
            </a>
            {branding && (
              <p className="mt-4 flex items-center gap-1.5 px-4 text-xs text-gray-400">
                Powered by{' '}
                <img
                  src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
                  alt="EONPRO"
                  className="h-[21px] w-auto"
                />
              </p>
            )}
          </div>
        </aside>

        {/* Mobile Bottom Navigation */}
        <nav className="pb-safe fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white px-2 md:hidden">
          <div className="flex h-16 items-center justify-around">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className="relative flex flex-1 flex-col items-center justify-center py-2"
                >
                  <span
                    className="transition-colors duration-200"
                    style={{ color: active ? primaryColor : '#9CA3AF' }}
                  >
                    {item.icon(active)}
                  </span>
                  <span
                    className={`mt-1 text-xs transition-colors duration-200 ${active ? 'font-medium' : ''}`}
                    style={{ color: active ? primaryColor : '#9CA3AF' }}
                  >
                    {item.label}
                  </span>
                  {active && (
                    <motion.div
                      layoutId="bottomNavIndicator"
                      className="absolute -top-0.5 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </a>
              );
            })}
          </div>
        </nav>

        {/* Page Content */}
        <main className="min-h-screen">{children}</main>
      </div>
    </BrandingProvider>
  );
}
