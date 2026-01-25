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
}

const navItems: NavItem[] = [
  {
    href: '/affiliate',
    label: 'Home',
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5} 
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/affiliate/earnings',
    label: 'Earnings',
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/affiliate/links',
    label: 'Links',
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    href: '/affiliate/account',
    label: 'Account',
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.5}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

      // Load clinic branding
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
            });

            // Update favicon if clinic has one
            if (data.branding?.faviconUrl) {
              const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const isActive = (href: string) => {
    if (href === '/affiliate') return pathname === '/affiliate';
    return pathname.startsWith(href);
  };

  // Get colors from branding or use defaults
  const primaryColor = branding?.primaryColor || '#111827';
  const portalName = branding?.name ? `${branding.name} Partners` : 'Partner Portal';

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 md:pl-64">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-100 flex-col">
        <div className="p-6 border-b border-gray-100">
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
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                  ${active 
                    ? 'text-white' 
                    : 'text-gray-600 hover:bg-gray-50'
                  }`}
                style={active ? { backgroundColor: primaryColor } : undefined}
              >
                {item.icon(active)}
                <span className="font-medium">{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-100">
          <a
            href="/affiliate/help"
            className="flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Help & Support</span>
          </a>
          {branding && !isMainApp && (
            <p className="text-xs text-gray-400 mt-4 px-4">
              Powered by <span className="font-medium">EONPRO</span>
            </p>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-2 pb-safe z-50">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center flex-1 py-2 relative"
              >
                <span 
                  className="transition-colors duration-200"
                  style={{ color: active ? primaryColor : '#9CA3AF' }}
                >
                  {item.icon(active)}
                </span>
                <span 
                  className={`text-xs mt-1 transition-colors duration-200 ${active ? 'font-medium' : ''}`}
                  style={{ color: active ? primaryColor : '#9CA3AF' }}
                >
                  {item.label}
                </span>
                {active && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
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
      <main className="min-h-screen">
        {children}
      </main>
    </div>
  );
}
