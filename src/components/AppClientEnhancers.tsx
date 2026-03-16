'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const AffiliateTracker = dynamic(() => import('@/components/AffiliateTracker'), { ssr: false });
const ConditionalHeader = dynamic(() => import('@/components/ConditionalHeader'), { ssr: false });
const SessionExpirationHandler = dynamic(
  () => import('@/components/SessionExpirationHandler'),
  { ssr: false },
);
const GlobalFetchInterceptor = dynamic(
  () => import('@/components/GlobalFetchInterceptor'),
  { ssr: false },
);
const BeccaAIGlobalChat = dynamic(() => import('@/components/BeccaAIGlobalChat'), { ssr: false });

const PUBLIC_ROUTE_PREFIXES = [
  '/affiliate',
  '/login',
  '/patient-login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/pay/',
  '/privacy-policy',
  '/terms-of-service',
  '/trt',
];

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

export default function AppClientEnhancers() {
  const pathname = usePathname() ?? '';

  const isPortalRoute =
    pathname.startsWith('/portal') || pathname.startsWith('/patient-portal');
  const isPublicRoute =
    pathname === '/' || pathname === '/dashboard' || startsWithAny(pathname, PUBLIC_ROUTE_PREFIXES);

  const shouldMountSessionInterceptors = !isPublicRoute && !isPortalRoute;
  const shouldMountHeader = !isPublicRoute && !isPortalRoute;
  const shouldMountBecca = !isPublicRoute && !isPortalRoute;

  return (
    <>
      <Suspense fallback={null}>
        <AffiliateTracker />
      </Suspense>

      {shouldMountSessionInterceptors ? (
        <>
          <GlobalFetchInterceptor />
          <SessionExpirationHandler />
        </>
      ) : null}

      {shouldMountHeader ? <ConditionalHeader /> : null}
      {shouldMountBecca ? <BeccaAIGlobalChat /> : null}
    </>
  );
}
