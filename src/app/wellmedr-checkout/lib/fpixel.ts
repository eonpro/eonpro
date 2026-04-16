/**
 * Meta Pixel events via GTM dataLayer.
 *
 * GTM owns the Meta Pixel initialization. This helper pushes
 * Meta-specific event names to dataLayer where GTM triggers
 * fire the corresponding fbq() calls via the native FB pixel tag.
 */
export function event(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: `meta_${name}`,
    meta_event_name: name,
    ...params,
  });
}
