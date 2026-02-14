'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

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

  // Pages that need full-width/custom layouts (no container/padding)
  const fullWidthPages = [
    '/login',
    '/register',
    '/email-verified',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/pay/',
    '/patients/', // Patient detail pages have their own layout
    '/affiliate/', // Affiliate landing pages have their own branded layout
  ];

  const isFullWidthPage = fullWidthPages.some((page) => pathname?.startsWith(page));

  if (isFullWidthPage) {
    // Return children without wrapper for full-width pages
    return <>{children}</>;
  }

  // Standard layout with responsive container
  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</main>
  );
}
