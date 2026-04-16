'use client';

import { usePathname } from 'next/navigation';
import { ReactNode, useMemo } from 'react';

interface ConditionalLayoutProps {
  children: ReactNode;
}

/**
 * ConditionalLayout
 *
 * Wraps children in the standard layout container with responsive padding,
 * EXCEPT for specific pages that need full-width/custom layouts.
 */
export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();

  const isFullWidthPage = useMemo(() => {
    const fullWidthPrefixes = [
      '/login',
      '/patient-login',
      '/register',
      '/email-verified',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
      '/pay/',
      '/patients/',
      '/affiliate/',
      '/provider',
      '/admin',
      '/tickets',
      '/orders',
      '/intake',
      '/intake-forms',
      '/patient-portal',
      '/portal',
      '/dashboard',
      '/checkout',
      '/wellmedr-checkout',
      '/request-demo',
      '/platform',
    ];
    if (pathname === '/' || fullWidthPrefixes.some((p) => pathname?.startsWith(p))) return true;
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const CUSTOM_DOMAINS = ['join.otmens.com', 'intake.otmens.com'];
      if (CUSTOM_DOMAINS.includes(host)) return true;
    }
    return false;
  }, [pathname]);

  if (isFullWidthPage) {
    // Return children without wrapper for full-width pages
    return <>{children}</>;
  }

  // Standard layout with responsive container
  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</main>
  );
}
