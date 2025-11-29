import { NextRequest, NextResponse } from 'next/server';
import clinicMiddleware from '@/middleware/clinic';

export async function middleware(request: NextRequest) {
  // Apply clinic middleware for multi-tenant support
  if (process.env.NEXT_PUBLIC_ENABLE_MULTI_CLINIC === 'true') {
    return clinicMiddleware(request);
  }
  
  // Default pass-through if multi-clinic is disabled
  return NextResponse.next();
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
