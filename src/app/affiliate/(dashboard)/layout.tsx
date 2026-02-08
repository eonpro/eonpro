'use client';

/**
 * Affiliate Dashboard Layout
 *
 * Mobile-first bottom navigation with elegant transitions.
 * Supports clinic branding (logo, colors).
 */

import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ReactNode, useEffect, useState } from 'react';
import { isBrowser } from '@/lib/utils/ssr-safe';

interface NavItem {
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

interface ClinicBranding {
  clinicId: number;
  name: string;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
}

const navItems: NavItem[] = [
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
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [isMainApp, setIsMainApp] = useState(false);

  // Check auth and load branding on mount
  useEffect(() => {
    const init = async () => {
      // Check auth
      try {
        const res = await fetch('/api/affiliate/auth/me', {
          credentials: 'include',
        });
        if (res.ok) {
          setIsAuthed(true);
        } else {
          router.push(`/affiliate/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
      } catch {
        router.push('/affiliate/login');
        return;
      }

      // Load clinic branding (with SSR guard)
      if (!isBrowser) return;
      try {
        const domain = window.location.hostname;
        const brandingRes = await fetch(`/api/clinic/resolve?domain=${encodeURIComponent(domain)}`);
        if (brandingRes.ok) {
          const data = await brandingRes.json();
          if (data.isMainApp) {
            setIsMainApp(true);
          } else {
            setBranding({
              clinicId: data.clinicId,
              name: data.name,
              logoUrl: data.branding?.logoUrl,
              iconUrl: data.branding?.iconUrl,
              faviconUrl: data.branding?.faviconUrl,
              primaryColor: data.branding?.primaryColor || '#111827',
              secondaryColor: data.branding?.secondaryColor || '#6B7280',
              accentColor: data.branding?.accentColor || '#10B981',
              backgroundColor: data.branding?.backgroundColor || '#F9FAFB',
            });

            // Update favicon if clinic has one
            if (data.branding?.faviconUrl) {
              const link =
                (document.querySelector("link[rel*='icon']") as HTMLLinkElement) ||
                document.createElement('link');
              link.type = 'image/x-icon';
              link.rel = 'shortcut icon';
              link.href = data.branding.faviconUrl;
              document.head.appendChild(link);
            }

            // Update page title
            document.title = `Partner Portal | ${data.name}`;
          }
        }
      } catch {
        // Silently fail - use default branding
      }
    };
    init();
  }, [pathname, router]);

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

  // Get colors from branding or use defaults
  const primaryColor = branding?.primaryColor || '#111827';
  const backgroundColor = branding?.backgroundColor || '#F9FAFB';
  const portalName = branding?.name ? `${branding.name} Partners` : 'Partner Portal';

  return (
    <div className="min-h-screen pb-20 md:pb-0 md:pl-64" style={{ backgroundColor }}>
      {/* Desktop Sidebar */}
      <aside className="fixed bottom-0 left-0 top-0 hidden w-64 flex-col border-r border-gray-100 bg-white md:flex">
        <div className="border-b border-gray-100 p-6">
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.name}
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
          {branding && !isMainApp && (
            <p className="mt-4 flex items-center gap-1.5 px-4 text-xs text-gray-400">
              Powered by{' '}
              <img
                src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
                alt="EONPRO"
                className="h-[0.98rem] w-auto"
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
  );
}
