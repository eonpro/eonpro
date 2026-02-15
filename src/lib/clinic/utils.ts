import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Extract clinic ID from request headers or cookies
 */
export async function getClinicIdFromRequest(request: NextRequest): Promise<number | null> {
  // Check header first (set by middleware)
  const headerClinicId = request.headers.get('x-clinic-id');
  if (headerClinicId) {
    return parseInt(headerClinicId);
  }

  // Check cookies as fallback
  const cookieStore = await cookies();
  const clinicCookie = cookieStore.get('selected-clinic');
  if (clinicCookie?.value) {
    return parseInt(clinicCookie.value);
  }

  return null;
}

/**
 * Get clinic ID from server-side context
 * This is for use in server components and API routes
 */
export async function getCurrentClinicId(): Promise<number | null> {
  const cookieStore = await cookies();
  const clinicCookie = cookieStore.get('selected-clinic');

  if (clinicCookie?.value) {
    return parseInt(clinicCookie.value);
  }

  // In production, you might want to check subdomain here as well
  // For now, return default clinic ID if configured
  if (process.env.DEFAULT_CLINIC_ID) {
    return parseInt(process.env.DEFAULT_CLINIC_ID);
  }

  return null;
}

/**
 * Verify that a resource belongs to the current clinic
 * Throws an error if there's a mismatch
 */
export function verifyClinicOwnership(
  resourceClinicId: number | null | undefined,
  currentClinicId: number | null
): void {
  if (!currentClinicId || !resourceClinicId) {
    return; // Skip check if either is not set (migration period)
  }

  if (resourceClinicId !== currentClinicId) {
    throw new Error('Access denied: Resource belongs to different clinic');
  }
}

/**
 * Check if user has access to a specific clinic
 */
export async function userHasClinicAccess(userId: number, clinicId: number): Promise<boolean> {
  // Import here to avoid circular dependency
  const { prisma } = await import('@/lib/db');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      clinicId: true,
      role: true,
    },
  });

  if (!user) {
    return false;
  }

  // Super admins have access to all clinics
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }

  // Other users only have access to their assigned clinic
  return user.clinicId === clinicId;
}

/**
 * Read a boolean clinic feature from raw features (e.g. patient.clinic.features).
 * Use for admin UI that must respect clinic feature flags (e.g. BLOODWORK_LABS for Labs tab).
 * Only explicit `false` turns the feature off; missing or true → enabled (avoids hiding by mistake).
 */
export function getClinicFeatureBoolean(
  rawFeatures: unknown,
  key: string,
  defaultWhenMissing: boolean = true
): boolean {
  if (rawFeatures == null || typeof rawFeatures !== 'object' || Array.isArray(rawFeatures)) {
    return defaultWhenMissing;
  }
  const value = (rawFeatures as Record<string, unknown>)[key];
  if (value === undefined) return defaultWhenMissing;
  return (value as boolean) !== false;
}

/**
 * Format clinic subdomain URL
 */
export function getClinicUrl(subdomain: string, customDomain?: string | null): string {
  if (customDomain) {
    return `https://${customDomain}`;
  }

  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001';

  // Handle localhost specially
  if (baseDomain.includes('localhost')) {
    return `http://${subdomain}.${baseDomain}`;
  }

  return `https://${subdomain}.${baseDomain}`;
}
