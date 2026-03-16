import type { MetadataRoute } from 'next';

/**
 * Allow crawlers to index the public marketing homepage at www.eonpro.io.
 * All other routes (admin, portal, API, etc.) are blocked.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [
          '/admin',
          '/dashboard',
          '/provider',
          '/patient-portal',
          '/portal',
          '/staff',
          '/super-admin',
          '/login',
          '/patient-login',
          '/register',
          '/api',
          '/affiliate',
          '/tickets',
          '/orders',
          '/patients',
          '/intake',
          '/intake-forms',
          '/settings',
          '/support',
          '/pay',
        ],
      },
    ],
  };
}
