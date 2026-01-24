/**
 * Affiliate Tracking Client
 * 
 * Client-side tracking for affiliate attribution.
 * Combines fingerprinting, cookies, and UTM tracking.
 * HIPAA-safe: Only stores anonymous tracking data.
 * 
 * Usage:
 *   import { AffiliateTracker } from '@/lib/affiliate/tracking-client';
 *   
 *   // Initialize on page load
 *   const tracker = new AffiliateTracker();
 *   await tracker.track();
 */

import {
  getOrCreateCookieId,
  setFirstTouch,
  setLastTouch,
  getFirstTouch,
  getLastTouch,
  getRefCodeFromUrl,
  parseUtmParams,
  parseSubIds,
  getAllAttributionData,
} from './cookie';
import { generateFingerprint, getVisitorId, hashIpAddress } from './fingerprint';

export interface TrackingConfig {
  cookieWindowDays?: number;
  enableFingerprinting?: boolean;
  enableSubIds?: boolean;
  apiEndpoint?: string;
  onTrackComplete?: (data: TrackingResult) => void;
  onError?: (error: Error) => void;
}

export interface TrackingResult {
  success: boolean;
  touchId?: number;
  isFirstTouch: boolean;
  refCode: string | null;
  cookieId: string;
  fingerprint?: string;
}

export interface TouchPayload {
  visitorFingerprint: string;
  cookieId: string;
  refCode: string;
  touchType: 'CLICK' | 'IMPRESSION' | 'POSTBACK';
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
  referrerUrl?: string;
  userAgent?: string;
  ipAddressHash?: string;
}

const DEFAULT_CONFIG: Required<TrackingConfig> = {
  cookieWindowDays: 30,
  enableFingerprinting: true,
  enableSubIds: true,
  apiEndpoint: '/api/affiliate/track',
  onTrackComplete: () => {},
  onError: () => {},
};

export class AffiliateTracker {
  private config: Required<TrackingConfig>;
  private fingerprint: string | null = null;
  private initialized = false;

  constructor(config: TrackingConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the tracker (generate fingerprint, etc.)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.enableFingerprinting) {
      this.fingerprint = await getVisitorId();
    }

    this.initialized = true;
  }

  /**
   * Track a click/visit with affiliate attribution
   */
  async track(options: {
    touchType?: 'CLICK' | 'IMPRESSION' | 'POSTBACK';
    refCode?: string;
  } = {}): Promise<TrackingResult> {
    try {
      await this.initialize();

      // Get ref code from URL or options
      const refCode = options.refCode || getRefCodeFromUrl();

      // No ref code = no affiliate attribution needed
      if (!refCode) {
        return {
          success: true,
          isFirstTouch: false,
          refCode: null,
          cookieId: getOrCreateCookieId(this.config.cookieWindowDays),
        };
      }

      // Get or create cookie ID
      const cookieId = getOrCreateCookieId(this.config.cookieWindowDays);

      // Parse UTM and sub-ID parameters
      const utmParams = parseUtmParams();
      const subIds = this.config.enableSubIds ? parseSubIds() : {};

      // Build touch data
      const touchData = {
        refCode,
        timestamp: Date.now(),
        utmSource: utmParams.source,
        utmMedium: utmParams.medium,
        utmCampaign: utmParams.campaign,
        utmContent: utmParams.content,
        utmTerm: utmParams.term,
        ...subIds,
        landingPage: typeof window !== 'undefined' ? window.location.pathname : undefined,
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      };

      // Set first touch (only if not already set)
      const isFirstTouch = setFirstTouch(touchData, this.config.cookieWindowDays);

      // Always update last touch
      setLastTouch(touchData, this.config.cookieWindowDays);

      // Send to server
      const payload: TouchPayload = {
        visitorFingerprint: this.fingerprint || cookieId,
        cookieId,
        refCode,
        touchType: options.touchType || 'CLICK',
        utmSource: utmParams.source,
        utmMedium: utmParams.medium,
        utmCampaign: utmParams.campaign,
        utmContent: utmParams.content,
        utmTerm: utmParams.term,
        ...subIds,
        landingPage: typeof window !== 'undefined' ? window.location.href : undefined,
        referrerUrl: typeof document !== 'undefined' ? document.referrer : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };

      const response = await this.sendToServer(payload);

      const result: TrackingResult = {
        success: true,
        touchId: response?.touchId,
        isFirstTouch,
        refCode,
        cookieId,
        fingerprint: this.fingerprint || undefined,
      };

      this.config.onTrackComplete(result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Tracking failed');
      this.config.onError(err);
      
      return {
        success: false,
        isFirstTouch: false,
        refCode: options.refCode || getRefCodeFromUrl(),
        cookieId: getOrCreateCookieId(this.config.cookieWindowDays),
      };
    }
  }

  /**
   * Send touch data to server
   */
  private async sendToServer(payload: TouchPayload): Promise<{ touchId?: number } | null> {
    try {
      const response = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      if (!response.ok) {
        console.warn('[AffiliateTracker] Server returned error:', response.status);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.warn('[AffiliateTracker] Failed to send to server:', error);
      return null;
    }
  }

  /**
   * Get current attribution data
   */
  getAttribution(): ReturnType<typeof getAllAttributionData> {
    return getAllAttributionData();
  }

  /**
   * Get first touch attribution
   */
  getFirstTouch() {
    return getFirstTouch();
  }

  /**
   * Get last touch attribution
   */
  getLastTouch() {
    return getLastTouch();
  }

  /**
   * Get the current ref code (from URL or last touch)
   */
  getCurrentRefCode(): string | null {
    // First check URL
    const urlRefCode = getRefCodeFromUrl();
    if (urlRefCode) return urlRefCode;

    // Fall back to last touch
    const lastTouch = getLastTouch();
    return lastTouch?.refCode || null;
  }

  /**
   * Check if there's any affiliate attribution
   */
  hasAttribution(): boolean {
    const { firstTouch, lastTouch } = getAllAttributionData();
    return !!(firstTouch || lastTouch);
  }

  /**
   * Get fingerprint (if enabled)
   */
  async getFingerprint(): Promise<string | null> {
    if (!this.config.enableFingerprinting) return null;
    await this.initialize();
    return this.fingerprint;
  }
}

/**
 * Auto-tracking script for embedding on pages
 * Usage: Include this script and call window.AffiliateTracker.autoTrack()
 */
export function autoTrack(config?: TrackingConfig): Promise<TrackingResult> {
  const tracker = new AffiliateTracker(config);
  return tracker.track();
}

/**
 * Get attribution data for conversion
 * Call this when a user converts (signs up, purchases, etc.)
 */
export async function getConversionAttribution(): Promise<{
  cookieId: string | null;
  fingerprint: string | null;
  firstTouch: ReturnType<typeof getFirstTouch>;
  lastTouch: ReturnType<typeof getLastTouch>;
}> {
  const attribution = getAllAttributionData();
  const fingerprint = await getVisitorId();

  return {
    cookieId: attribution.cookieId,
    fingerprint,
    firstTouch: attribution.firstTouch,
    lastTouch: attribution.lastTouch,
  };
}

// Export singleton instance for convenience
let defaultTracker: AffiliateTracker | null = null;

export function getDefaultTracker(config?: TrackingConfig): AffiliateTracker {
  if (!defaultTracker) {
    defaultTracker = new AffiliateTracker(config);
  }
  return defaultTracker;
}

// Make available globally for script-based integration
if (typeof window !== 'undefined') {
  (window as any).AffiliateTracker = {
    autoTrack,
    getConversionAttribution,
    getDefaultTracker,
    AffiliateTracker,
  };
}
