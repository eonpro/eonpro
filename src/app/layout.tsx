import '../styles/globals.css';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { Suspense } from 'react';
import Script from 'next/script';
import ConditionalHeader from '@/components/ConditionalHeader';
import BeccaAIGlobalChat from '@/components/BeccaAIGlobalChat';
import ErrorBoundary from '@/components/ErrorBoundary';
import ConditionalLayout from '@/components/ConditionalLayout';
import SessionExpirationHandler from '@/components/SessionExpirationHandler';
import GlobalFetchInterceptor from '@/components/GlobalFetchInterceptor';
import AffiliateTracker from '@/components/AffiliateTracker';
import { ToastProvider } from '@/components/Toast';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
// DevAuth removed for production
import { ClientProviders } from '@/components/providers/ClientProviders';
// Using Outfit as fallback until Sofia Pro files are added
// To use Sofia Pro: 1) Add font files to public/fonts/ 2) Switch import to './fonts'
import { outfitFont as sofiaPro } from './fonts-fallback';
// import { outfitFont as sofiaPro } from "./fonts-fallback";
// import { sofiaPro } from "./fonts"; // Uncomment when Sofia Pro files are added // Uncomment when Sofia Pro files are added

export const metadata = {
  title: 'EONPRO',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/favicon.svg' }],
  },
};

/** White browser chrome (status bar + URL bar) on mobile for patient portal and app. */
export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Google Maps API key is optional - only needed for address autocomplete feature
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <html lang="en" className={sofiaPro.variable} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className={sofiaPro.className} suppressHydrationWarning>
        <ErrorBoundary>
          <ClientProviders>
            <ToastProvider>
              <Suspense fallback={null}>
                <AffiliateTracker />
              </Suspense>
              <GlobalFetchInterceptor />
              <SessionExpirationHandler />
              <ConditionalHeader />
              <ConditionalLayout>{children}</ConditionalLayout>
              {/* Becca AI Assistant - Only shown for authenticated users with proper roles */}
              <BeccaAIGlobalChat />
            </ToastProvider>
          </ClientProviders>
          {mapsKey ? (
            <Script
              async
              defer
              strategy="afterInteractive"
              src={`https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places&loading=async`}
            />
          ) : undefined}
        </ErrorBoundary>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
