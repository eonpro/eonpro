'use client';

const prefetchedRoutes = new Set<string>();

/**
 * Opportunistically prefetches same-origin routes to reduce first-navigation latency.
 * Safe no-op during SSR and deduplicated per browser session.
 */
export function prefetchRoute(href: string): void {
  if (typeof document === 'undefined' || !href) return;
  if (prefetchedRoutes.has(href)) return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  document.head.appendChild(link);
  prefetchedRoutes.add(href);
}
