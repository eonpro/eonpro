import type { MetadataRoute } from 'next';

/**
 * Block crawlers from the app except for the public marketing pages.
 * The /platform route is the customer-facing website for www.eonpro.io.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/platform'],
        disallow: ['/'],
      },
    ],
  };
}
