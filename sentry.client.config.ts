import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Environment and release tracking
    environment,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'local',
    
    // Performance Monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% in production, 100% in development
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/yourserver\.io\/api/,
      /^https:\/\/(staging\.)?lifefile\.com/
    ],
    
    // Session Replay
    replaysSessionSampleRate: isProduction ? 0.1 : 0, // 10% of sessions in production
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
    
    // Error filtering
    ignoreErrors: [
      // Browser extensions
      "Non-Error promise rejection captured",
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      
      // Network errors
      "NetworkError",
      "Network request failed",
      "Failed to fetch",
      
      // User cancellations
      "Request aborted",
      "User cancelled",
      "Request cancelled",
      
      // Known third-party errors
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
    ],
    
    // Integrations
    integrations: [
      // Browser tracing
      Sentry.browserTracingIntegration(),
      
      // Replay integration for session recording
      Sentry.replayIntegration({
        maskAllText: false,
        maskAllInputs: true, // HIPAA compliance - mask sensitive inputs
        blockAllMedia: false,
        
        // Mask sensitive data selectors
        mask: [".sensitive-data", "[data-sensitive]"],
        unmask: [".public-data"],
        
        // Network recording
        networkDetailAllowUrls: [window.location.origin],
        networkRequestHeaders: ["X-Request-ID"],
        networkResponseHeaders: ["X-Response-ID"],
      }),
      
      // Breadcrumb filtering
      Sentry.breadcrumbsIntegration({
        console: isProduction ? false : true,
        dom: true,
        fetch: true,
        history: true,
        xhr: true,
      }),
    ],
    
    // Hooks
    beforeSend(event, hint) {
      // Filter out sensitive data
      if (event.request) {
        // Remove authorization headers
        if (event.request.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['Cookie'];
          delete event.request.headers['X-API-Key'];
        }
        
        // Remove sensitive query params
        if (event.request.query_string) {
          const queryString = event.request.query_string;
          if (typeof queryString === 'string') {
            event.request.query_string = queryString.replace(
              /(?:password|token|api_key|secret)=[^&]+/gi,
              '$1=[FILTERED]'
            );
          }
        }
      }
      
      // Filter user data
      if (event.user) {
        // Only keep non-sensitive user info
        event.user = {
          id: event.user.id,
          email: event.user.email?.replace(/^(.{2}).*@/, '$1***@'), // Partial email masking
        };
      }
      
      // Add custom context
      event.contexts = {
        ...event.contexts,
        app: {
          app_version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
          feature_flags: {
            stripe_subscriptions: process.env.NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS === 'true',
            twilio_sms: process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS === 'true',
            aws_s3: process.env.NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE === 'true',
          },
        },
      };
      
      // Don't send events in development unless explicitly enabled
      if (!isProduction && !process.env.NEXT_PUBLIC_SENTRY_DEBUG) {
        return null;
      }
      
      return event;
    },
    
    // Transport options (keepalive is now default in v10)
  });
  
  // Set initial user context if available - wrapped in setTimeout to avoid hydration issues
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      const userEmail = localStorage.getItem('userEmail');
      if (userEmail) {
        Sentry.setUser({
          email: userEmail.replace(/^(.{2}).*@/, '$1***@'),
        });
      }
    }, 0);
  }
}
