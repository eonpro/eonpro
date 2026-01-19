import "../styles/globals.css";
import type { ReactNode } from "react";
import Script from "next/script";
import ConditionalHeader from "@/components/ConditionalHeader";
import BeccaAIGlobalChat from "@/components/BeccaAIGlobalChat";
import ErrorBoundary from "@/components/ErrorBoundary";
import ConditionalLayout from "@/components/ConditionalLayout";
import SessionExpirationHandler from "@/components/SessionExpirationHandler";
// DevAuth removed for production
import { ClientProviders } from "@/components/providers/ClientProviders";
// Using Outfit as fallback until Sofia Pro files are added
// To use Sofia Pro: 1) Add font files to public/fonts/ 2) Switch import to './fonts'
import { outfitFont as sofiaPro } from "./fonts-fallback";
// import { outfitFont as sofiaPro } from "./fonts-fallback";
// import { sofiaPro } from "./fonts"; // Uncomment when Sofia Pro files are added // Uncomment when Sofia Pro files are added

export const metadata = { title: "EONPRO" };

export default function RootLayout({ children }: { children: ReactNode }) {
  // Google Maps API key is optional - only needed for address autocomplete feature
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <html lang="en" className={sofiaPro.variable}>
      <head>
        <link rel="icon" href="https://static.wixstatic.com/media/c49a9b_2e6625f0f27d44068998ab51675c6d7b~mv2.png" />
      </head>
      <body className={sofiaPro.className}>
        <ErrorBoundary>
        <ClientProviders>
          <SessionExpirationHandler />
          <ConditionalHeader />
          <ConditionalLayout>{children}</ConditionalLayout>
          {/* Becca AI Assistant - Only shown for authenticated users with proper roles */}
          <BeccaAIGlobalChat />
        </ClientProviders>
{mapsKey ? (
  <Script
    async
    defer
    strategy="afterInteractive"
    src={`https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places&loading=async`}
  />
)  : undefined}
        </ErrorBoundary>
      </body>
    </html>
  );
}
