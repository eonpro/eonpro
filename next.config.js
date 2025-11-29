const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import("next").NextConfig} */
const nextConfig = {
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
    ],
  },
  
  // Sentry error handling
  sentry: {
    hideSourceMaps: true, // Hide source maps in production
    widenClientFileUpload: true, // Upload larger files
  },
  
  // Performance optimizations
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  // Experimental features for better performance
  experimental: {
    optimizeCss: false, // Disabled due to font rendering issues
    optimizePackageImports: ['lucide-react', '@stripe/stripe-js'],
    esmExternals: 'loose', // Help with SSR issues
  },
  
  // Turbopack configuration (Next.js 16+)
  turbopack: {
    // Turbopack is now the default in Next.js 16
  },
  
  // Webpack configuration (fallback)
  webpack: (config, { isServer }) => {
    // Fix for Prisma client in production
    if (isServer && config.externals) {
      config.externals.push('@prisma/client');
    }
    return config;
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
