const path = require('path');
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Standalone for Docker/self-host. Vercel uses its own optimization - standalone can cause 404.
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),

  outputFileTracingRoot: path.resolve(__dirname),

  serverExternalPackages: [
    '@prisma/client',
    '@napi-rs/canvas',
    'pdf-parse',
    'puppeteer',
    'pdfkit',
    '@pdf-lib/fontkit',
  ],

  // TypeScript: CI MUST run "npm run type-check" and fail on type errors (see .github/workflows/ci.yml).
  // ignoreBuildErrors kept for Vercel OOM; production deploy is gated by CI type-check.
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.wixstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'lottie.host',
      },
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      },
    ],
    // Optimize images
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
  },
  
  // Compiler optimizations
  compiler: {
    // Remove console logs in production (keep errors and warnings)
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  experimental: {
    // serverMinification removed — not recognized by Next.js 16
    optimizePackageImports: [
      'lucide-react',
      '@stripe/stripe-js',
      '@stripe/react-stripe-js',
      'date-fns',
      'chart.js',
      'react-chartjs-2',
    ],
  },

  // Patient portal at /portal (eonmeds.eonpro.io/portal, wellmedr.eonpro.io/portal, etc.)
  // beforeFiles so /portal is rewritten before filesystem (avoids 404 when app/portal/ exists).
  // /portal/affiliate is unchanged (affiliate portal).
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/portal/affiliate', destination: '/portal/affiliate' },
        { source: '/portal/affiliate/:path*', destination: '/portal/affiliate/:path*' },
        { source: '/portal', destination: '/patient-portal' },
        { source: '/portal/:path*', destination: '/patient-portal/:path*' },
      ],
    };
  },

  // Security headers are set in src/middleware.ts (single authoritative source).
  // Do NOT duplicate them here — next.config.js headers can conflict with middleware
  // (e.g. middleware sets X-Frame-Options: SAMEORIGIN while config set DENY).
  
  // Webpack configuration (when using --webpack for production)
  webpack: (config, { isServer, nextRuntime }) => {
    // Vercel: memory cache to avoid filesystem cache exceeding 1GB upload limit.
    // CI/Docker: filesystem cache for faster rebuilds.
    config.cache = process.env.VERCEL
      ? { type: 'memory' }
      : { type: 'filesystem' };

    // Handle "node:" built-in imports for different server runtimes.
    if (isServer && nextRuntime === 'edge') {
      // Edge Runtime: node:* modules must NOT appear as externals.
      // Vercel rejects Edge Functions that reference unsupported Node.js modules.
      // Use IgnorePlugin to silently eliminate node:* imports from the edge bundle.
      // This is safe because edge code never executes the Node.js code paths
      // (instrumentation.ts guards with NEXT_RUNTIME !== 'nodejs').
      const webpack = require('next/dist/compiled/webpack/webpack');
      config.plugins.push(
        new webpack.webpack.IgnorePlugin({
          resourceRegExp: /^node:/,
        })
      );
    } else if (isServer) {
      // Node.js Runtime: externalize node:* as commonjs requires.
      const externals = config.externals || [];
      const handler = ({ request }, callback) => {
        if (typeof request === 'string' && request.startsWith('node:')) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      };
      config.externals = Array.isArray(externals) ? [...externals, handler] : [externals, handler];
    }

    // Bundle analyzer requires webpack config
    if (process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: isServer
            ? '../analyze/server.html'
            : './analyze/client.html',
        })
      );
    }
    
    return config;
  },

  // Production optimizations
  productionBrowserSourceMaps: false, // Disable source maps in production
  
  // Logging
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
};

// Sentry configuration wrapper (v10 API)
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  dryRun: !process.env.SENTRY_AUTH_TOKEN,

  // Tunnel requests through our domain to fix CORS and bypass ad-blockers
  tunnelRoute: '/api/sentry',

  // Source maps
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: true,
  
  // Release configuration
  release: {
    create: true,
    finalize: true,
    deploy: {
      env: process.env.NODE_ENV || 'development',
    },
  },

  // Webpack-specific build options (Sentry v10 API).
  // autoInstrumentMiddleware: false prevents Sentry from wrapping the middleware
  // with its Edge SDK, which transitively pulls in node:os (unsupported in Edge Runtime).
  webpack: {
    autoInstrumentMiddleware: false,
  },
};

// Export with Sentry wrapping DISABLED on Vercel due to Edge Runtime incompatibility.
// Sentry's dependency chain (@sentry/node-core via @sentry/vercel-edge) pulls node:os
// into the middleware edge bundle, which Vercel rejects. Client-side Sentry still works
// via sentry.client.config.ts. Server-side works via sentry.server.config.ts + instrumentation.
// TODO: Re-enable withSentryConfig once Sentry v10 fixes Edge Runtime compatibility,
//       or after migrating middleware to the Next.js 16 "proxy" convention.
const useSentryWrapper = !process.env.VERCEL
  && (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

module.exports = useSentryWrapper
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
