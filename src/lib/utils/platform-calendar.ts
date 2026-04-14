/**
 * Platform calendar dates: prefer the user's IANA timezone (browser or cookie),
 * then clinic timezone when wired in, then {@link PLATFORM_FALLBACK_TIMEZONE}.
 * Do not use `Date.prototype.toISOString().split('T')[0]` for "what day is it?" —
 * that is UTC midnight calendar, not local business calendar.
 */

import {
  PLATFORM_FALLBACK_TIMEZONE,
  todayInTimeZone,
  toCalendarDateStringInTz,
  normalizeIANATimeZone,
} from '@/lib/utils/timezone';

export {
  PLATFORM_FALLBACK_TIMEZONE,
  todayInTimeZone,
  toCalendarDateStringInTz,
  normalizeIANATimeZone,
} from '@/lib/utils/timezone';

/** Browser IANA zone; on the server returns {@link PLATFORM_FALLBACK_TIMEZONE}. */
export function getBrowserIANATimeZone(): string {
  if (typeof window === 'undefined') return PLATFORM_FALLBACK_TIMEZONE;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || PLATFORM_FALLBACK_TIMEZONE;
  } catch {
    return PLATFORM_FALLBACK_TIMEZONE;
  }
}

/** Today `YYYY-MM-DD` in the browser's timezone (SSR/SSG: Eastern fallback). */
export function calendarTodayClient(): string {
  return todayInTimeZone(getBrowserIANATimeZone());
}

/**
 * Server-safe "today" for APIs and SSR: optional clinic zone, else Eastern fallback.
 * After the user visits the app, {@link ClientTimeZoneBootstrap} sets `eonpro_tz` for future requests.
 */
export function calendarTodayServer(clinicIANA?: string | null): string {
  return todayInTimeZone(normalizeIANATimeZone(clinicIANA) ?? PLATFORM_FALLBACK_TIMEZONE);
}

/** Bucket an instant into a calendar day string using the given zone (default: platform fallback). */
export function instantToCalendarDate(
  d: Date,
  iana: string | null | undefined = PLATFORM_FALLBACK_TIMEZONE
): string {
  return toCalendarDateStringInTz(d, normalizeIANATimeZone(iana) ?? PLATFORM_FALLBACK_TIMEZONE);
}

const TZ_COOKIE = 'eonpro_tz';

/** Read `eonpro_tz` from a Next.js `cookies()` store or similar. */
export function calendarTimeZoneFromCookie(
  getCookie: (name: string) => string | undefined | null
): string | null {
  const raw = getCookie(TZ_COOKIE);
  return normalizeIANATimeZone(raw ? decodeURIComponent(raw) : null);
}

/** Prefer cookie (user browser), then clinic, then platform fallback. */
export function resolveCalendarTimeZone(opts: {
  cookieGetter?: (name: string) => string | undefined | null;
  clinicIANA?: string | null;
}): string {
  const fromCookie = opts.cookieGetter ? calendarTimeZoneFromCookie(opts.cookieGetter) : null;
  return fromCookie ?? normalizeIANATimeZone(opts.clinicIANA) ?? PLATFORM_FALLBACK_TIMEZONE;
}

export { TZ_COOKIE as PLATFORM_TIMEZONE_COOKIE_NAME };
