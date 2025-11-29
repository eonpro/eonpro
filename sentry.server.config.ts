import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Environment and release tracking
    environment,
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    
    // Performance Monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    profilesSampleRate: isProduction ? 0.1 : 1.0, // Profiling for performance
    
    // Error filtering
    ignoreErrors: [
      // Database errors that are handled
      "SQLITE_BUSY",
      "SQLITE_LOCKED",
      "P2002", // Prisma unique constraint
      "P2025", // Prisma record not found
      
      // Expected API errors
      "401 Unauthorized",
      "403 Forbidden",
      "404 Not Found",
      
      // Rate limiting
      "Too Many Requests",
      "Rate limit exceeded",
    ],
    
    // Integrations
    integrations: [
      // Database query monitoring
      Sentry.prismaIntegration(),
      
      // HTTP request monitoring
      Sentry.httpIntegration({
        breadcrumbs: true,
      }),
      
      // Custom integration for API monitoring
      {
        name: "APIMonitoring",
        setupOnce() {
          // Monitor API response times
          Sentry.addIntegration({
            name: "api-monitoring",
            setup(client) {
              client.on("beforeEnvelope", (envelope) => {
                // Add API metrics to envelope
              });
            },
          });
        },
      },
    ],
    
    // Hooks
    beforeSend(event, hint) {
      // Remove sensitive server data
      if (event.request) {
        // Remove sensitive headers
        if (event.request && event.request.headers) {
          const sensitiveHeaders = [
            'authorization',
            'cookie',
            'x-api-key',
            'x-lifefile-signature',
            'stripe-signature',
          ];
          
          sensitiveHeaders.forEach(header => {
            if (event.request?.headers) {
              delete event.request.headers[header];
            }
          });
        }
        
        // Remove sensitive body data
        if (event.request.data) {
          const sensitiveFields = [
            'password',
            'ssn',
            'dob',
            'creditCard',
            'cvv',
            'patientId',
          ];
          
          const sanitizeData = (data: any): any => {
            if (typeof data === 'object' && data !== null) {
              const sanitized = { ...data };
              sensitiveFields.forEach(field => {
                if (field in sanitized) {
                  sanitized[field] = '[FILTERED]';
                }
              });
              
              // Recursively sanitize nested objects
              Object.keys(sanitized).forEach(key => {
                if (typeof sanitized[key] === 'object') {
                  sanitized[key] = sanitizeData(sanitized[key]);
                }
              });
              
              return sanitized;
            }
            return data;
          };
          
          event.request.data = sanitizeData(event.request.data);
        }
      }
      
      // Add server context
      event.contexts = {
        ...event.contexts,
        runtime: {
          name: 'node',
          version: process.version,
        },
        server: {
          memory_usage: process.memoryUsage(),
          uptime: process.uptime(),
        },
      };
      
      // Tag events with service info
      event.tags = {
        ...event.tags,
        service: 'lifefile-api',
        deployment: process.env.VERCEL_ENV || 'local',
      };
      
      // Don't send in development unless debugging
      if (!isProduction && !process.env.SENTRY_DEBUG) {
        return null;
      }
      
      return event;
    },
    
    // Spotlight for local development
    spotlight: !isProduction,
  });
  
  // Monitor database performance
  if (isProduction) {
    setInterval(() => {
      // Send custom metrics to Sentry
      Sentry.metrics.gauge('database.connections', 10); // Replace with actual metric
      Sentry.metrics.gauge('api.response_time', 250); // Replace with actual metric
    }, 60000); // Every minute
  }
}
