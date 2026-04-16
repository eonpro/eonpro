function capture(event: string, properties?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.posthog?.capture) {
    window.posthog.capture(event, properties);
  }
}

export function trackCheckoutStarted(data: Record<string, unknown>) {
  capture('checkout_started', data);
}

export function trackPaymentInfoSubmitted(data: Record<string, unknown>) {
  capture('payment_info_submitted', data);
}

export function trackCheckoutCompleted(data: Record<string, unknown>) {
  capture('checkout_completed', data);
}

export function trackCheckoutFailed(data: Record<string, unknown>) {
  capture('checkout_failed', data);
}
