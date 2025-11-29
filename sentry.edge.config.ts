import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment,
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    
    // Lower sample rate for edge functions
    tracesSampleRate: isProduction ? 0.05 : 0.5,
    
    // Edge-specific configuration
    integrations: [
      // Add edge runtime monitoring
      Sentry.winterCGFetchIntegration({
        breadcrumbs: true,
        shouldCreateSpanForRequest: (url) => {
          // Only create spans for our API calls
          return url.includes('/api/');
        },
      }),
    ],
    
    beforeSend(event) {
      // Tag as edge function
      event.tags = {
        ...event.tags,
        runtime: 'edge',
        service: 'lifefile-edge',
      };
      
      if (!isProduction && !process.env.SENTRY_DEBUG) {
        return null;
      }
      
      return event;
    },
  });
}
