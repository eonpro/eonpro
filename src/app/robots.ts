import type { MetadataRoute } from 'next';

/**
 * Block all crawlers from the entire app. Only www.eonpro.io (marketing site,
 * separate deployment) should be indexed by search engines.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: ['/'],
      },
    ],
  };
}
