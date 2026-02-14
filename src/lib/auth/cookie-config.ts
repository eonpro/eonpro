/**
 * Enterprise Secure Cookie Configuration
 * HIPAA-compliant auth cookies for telehealth platform.
 *
 * - httpOnly: Prevents XSS access to tokens
 * - secure: HTTPS only in production
 * - sameSite: CSRF protection (lax allows same-site + top-level nav)
 *
 * @module auth/cookie-config
 */

export interface SecureCookieOptions {
  name: string;
  value: string;
  maxAge?: number; // seconds
  domain?: string;
  path?: string;
}

/**
 * Default secure cookie options for auth tokens.
 * Use with response.cookies.set() in login/refresh routes.
 */
export const SECURE_AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  // SameSite=lax: cookies sent on same-site requests and top-level navigation
  // Use 'strict' for stricter CSRF if no cross-subdomain auth needed
};

/**
 * Cookie names for auth tokens (role-specific)
 */
export const AUTH_COOKIE_NAMES = [
  'auth-token',
  'admin-token',
  'provider-token',
  'patient-token',
  'affiliate-token',
  'super_admin-token',
  'staff-token',
  'support-token',
] as const;

/**
 * Build cookie options for a given domain (e.g. .eonpro.io for subdomains)
 */
export function buildAuthCookieOptions(options: {
  name: string;
  value: string;
  maxAge?: number;
  domain?: string;
}): Record<string, unknown> {
  return {
    ...SECURE_AUTH_COOKIE_OPTIONS,
    name: options.name,
    value: options.value,
    maxAge: options.maxAge ?? 60 * 60 * 24, // 24h default
    ...(options.domain && { domain: options.domain }),
  };
}
