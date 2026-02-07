const { withSentryConfig } = require("@sentry/nextjs");

// Bundle analyzer (only when ANALYZE=true)
const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (config) => config;

/** @type {import("next").NextConfig} */
const nextConfig = {
  // TypeScript configuration
  typescript: {
    // Skip type checking during build - CI handles this separately
    // This prevents OOM errors on large codebases during Vercel builds
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
  
  // Experimental features compatible with Turbopack
  experimental: {
    // Optimize specific package imports (reduces bundle size)
    optimizePackageImports: [
      'lucide-react',
      '@stripe/stripe-js',
      '@stripe/react-stripe-js',
      'date-fns',
      'chart.js',
      'react-chartjs-2',
    ],
  },

  // Turbopack configuration (Next.js 16+ default bundler)
  turbopack: {},
  
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

  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
  
  // Webpack configuration (when not using Turbopack)
  webpack: (config, { isServer }) => {
    // Fix for Prisma client in production
    if (isServer && config.externals) {
      config.externals.push('@prisma/client');
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

// Sentry configuration wrapper
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true, // Suppresses all logs
  dryRun: !process.env.SENTRY_AUTH_TOKEN, // Skip upload if no auth token
  
  // Source maps
  hideSourceMaps: true,
  widenClientFileUpload: true,
  
  // Release configuration
  release: {
    create: true,
    finalize: true,
    deploy: {
      env: process.env.NODE_ENV || 'development',
    },
  },
  
  // Disable in development
  disableLogger: process.env.NODE_ENV !== 'production',
};

// Export with Sentry only if DSN is configured
module.exports = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
