/**
 * Affiliate Tracking Library
 * 
 * Client-side utilities for affiliate attribution tracking.
 * 
 * Usage:
 *   // Import the tracker
 *   import { AffiliateTracker, autoTrack } from '@/lib/affiliate';
 *   
 *   // Auto-track on page load
 *   useEffect(() => {
 *     autoTrack();
 *   }, []);
 *   
 *   // Or use the class directly
 *   const tracker = new AffiliateTracker({ cookieWindowDays: 60 });
 *   tracker.track();
 */

export {
  AffiliateTracker,
  autoTrack,
  getConversionAttribution,
  getDefaultTracker,
  type TrackingConfig,
  type TrackingResult,
  type TouchPayload,
} from './tracking-client';

export {
  getOrCreateCookieId,
  setFirstTouch,
  setLastTouch,
  getFirstTouch,
  getLastTouch,
  getRefCodeFromUrl,
  parseUtmParams,
  parseSubIds,
  getAllAttributionData,
  clearAllAffiliateCookies,
} from './cookie';

export {
  generateFingerprint,
  getVisitorId,
  hashIpAddress,
} from './fingerprint';
