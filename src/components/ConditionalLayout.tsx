'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface ConditionalLayoutProps {
  children: ReactNode;
}

/**
 * ConditionalLayout
 * 
 * Wraps children in the standard layout container with padding and max-width,
 * EXCEPT for specific pages that need full-width/custom layouts.
 */
export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();

  // Pages that need full-width/custom layouts (no container/padding)
  const fullWidthPages = [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/pay/',
  ];

  const isFullWidthPage = fullWidthPages.some(page => pathname?.startsWith(page));

  if (isFullWidthPage) {
    // Return children without wrapper for full-width pages
    return <>{children}</>;
  }

  // Standard layout with container
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {children}
    </main>
  );
}
