/**
 * Affiliate Cookie Management
 * 
 * Handles first-party cookies for affiliate attribution tracking.
 * HIPAA-safe: Only stores anonymous tracking IDs, no PHI.
 */

const COOKIE_PREFIX = 'aff_';
const COOKIE_ID_KEY = `${COOKIE_PREFIX}cid`;  // Cookie ID
const FIRST_TOUCH_KEY = `${COOKIE_PREFIX}ft`; // First touch data
const LAST_TOUCH_KEY = `${COOKIE_PREFIX}lt`;  // Last touch data
const UTM_KEY = `${COOKIE_PREFIX}utm`;        // UTM parameters

interface TouchData {
  affiliateId?: number;
  refCode: string;
  timestamp: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  subId1?: string;
  subId2?: string;
  subId3?: string;
  subId4?: string;
  subId5?: string;
  landingPage?: string;
  referrer?: string;
}

interface CookieOptions {
  days?: number;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  domain?: string;
}

/**
 * Generate a unique cookie ID
 */
export function generateCookieId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}_${random}`;
}

/**
 * Set a cookie with proper security settings
 */
export function setCookie(
  name: string, 
  value: string, 
  options: CookieOptions = {}
): void {
  if (typeof document === 'undefined') return;

  const {
    days = 30,
    secure = true,
    sameSite = 'Lax',
    domain,
  } = options;

  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);

  let cookie = `${name}=${encodeURIComponent(value)}`;
  cookie += `; expires=${expires.toUTCString()}`;
  cookie += '; path=/';
  
  if (domain) {
    cookie += `; domain=${domain}`;
  }
  
  if (secure && window.location.protocol === 'https:') {
    cookie += '; Secure';
  }
  
  cookie += `; SameSite=${sameSite}`;

  document.cookie = cookie;
}

/**
 * Get a cookie value
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  
  for (let c of ca) {
    c = c.trim();
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length));
    }
  }
  
  return null;
}

/**
 * Delete a cookie
 */
export function deleteCookie(name: string, domain?: string): void {
  if (typeof document === 'undefined') return;

  let cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  if (domain) {
    cookie += `; domain=${domain}`;
  }
  document.cookie = cookie;
}

/**
 * Get or create a unique cookie ID for this visitor
 */
export function getOrCreateCookieId(windowDays: number = 30): string {
  let cookieId = getCookie(COOKIE_ID_KEY);
  
  if (!cookieId) {
    cookieId = generateCookieId();
    setCookie(COOKIE_ID_KEY, cookieId, { days: windowDays });
  }
  
  return cookieId;
}

/**
 * Store first touch attribution data (only if not already set)
 */
export function setFirstTouch(data: TouchData, windowDays: number = 30): boolean {
  const existing = getCookie(FIRST_TOUCH_KEY);
  
  if (existing) {
    // First touch already exists, don't overwrite
    return false;
  }
  
  setCookie(FIRST_TOUCH_KEY, JSON.stringify(data), { days: windowDays });
  return true;
}

/**
 * Store last touch attribution data (always overwrites)
 */
export function setLastTouch(data: TouchData, windowDays: number = 30): void {
  setCookie(LAST_TOUCH_KEY, JSON.stringify(data), { days: windowDays });
}

/**
 * Get first touch attribution data
 */
export function getFirstTouch(): TouchData | null {
  const data = getCookie(FIRST_TOUCH_KEY);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Get last touch attribution data
 */
export function getLastTouch(): TouchData | null {
  const data = getCookie(LAST_TOUCH_KEY);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Parse UTM parameters from URL
 */
export function parseUtmParams(url?: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  
  const urlObj = new URL(url || window.location.href);
  const params: Record<string, string> = {};
  
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  
  for (const key of utmKeys) {
    const value = urlObj.searchParams.get(key);
    if (value) {
      params[key.replace('utm_', '')] = value;
    }
  }
  
  return params;
}

/**
 * Parse sub-ID parameters from URL
 */
export function parseSubIds(url?: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  
  const urlObj = new URL(url || window.location.href);
  const params: Record<string, string> = {};
  
  for (let i = 1; i <= 5; i++) {
    const value = urlObj.searchParams.get(`sub${i}`) || urlObj.searchParams.get(`subid${i}`);
    if (value) {
      params[`subId${i}`] = value;
    }
  }
  
  return params;
}

/**
 * Get ref code from URL
 */
export function getRefCodeFromUrl(url?: string): string | null {
  if (typeof window === 'undefined') return null;
  
  const urlObj = new URL(url || window.location.href);
  
  // Check multiple common parameter names
  const paramNames = ['ref', 'refcode', 'affiliate', 'aff', 'partner', 'via'];
  
  for (const name of paramNames) {
    const value = urlObj.searchParams.get(name);
    if (value) return value;
  }
  
  return null;
}

/**
 * Clear all affiliate tracking cookies
 */
export function clearAllAffiliateCookies(domain?: string): void {
  deleteCookie(COOKIE_ID_KEY, domain);
  deleteCookie(FIRST_TOUCH_KEY, domain);
  deleteCookie(LAST_TOUCH_KEY, domain);
  deleteCookie(UTM_KEY, domain);
}

/**
 * Get all attribution data for the current visitor
 */
export function getAllAttributionData(): {
  cookieId: string | null;
  firstTouch: TouchData | null;
  lastTouch: TouchData | null;
} {
  return {
    cookieId: getCookie(COOKIE_ID_KEY),
    firstTouch: getFirstTouch(),
    lastTouch: getLastTouch(),
  };
}
