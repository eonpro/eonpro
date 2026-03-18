/**
 * Intake Analytics — step-level event tracking
 *
 * Uses Vercel Analytics track() when available, falls back to console.
 * Events are fire-and-forget — never blocks the user flow.
 */

type IntakeEvent =
  | 'intake_step_viewed'
  | 'intake_step_completed'
  | 'intake_form_completed'
  | 'intake_checkout_started'
  | 'intake_payment_completed';

type EventData = Record<string, string | number | boolean | undefined>;

let vercelTrack: ((name: string, data?: EventData) => void) | null = null;

if (typeof window !== 'undefined') {
  import('@vercel/analytics').then((mod) => {
    vercelTrack = mod.track;
  }).catch(() => {});
}

export function trackIntakeEvent(event: IntakeEvent, data?: EventData) {
  try {
    const payload = { ...data, timestamp: Date.now() };

    if (vercelTrack) {
      vercelTrack(event, payload);
    }

    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', event, payload);
    }
  } catch {
    // Never throw — analytics must never break the user flow
  }
}
