'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { pushViewItem, pushAddToCart, pushBeginCheckout, pushPurchase } from '../lib/tracking';
import { event as trackMetaEvent } from '../lib/fpixel';
import {
  trackCheckoutStarted,
  trackPaymentInfoSubmitted,
  trackCheckoutCompleted,
} from '../lib/posthog-events';

// ── Types ──────────────────────────────────────────────────────────

type Platform = 'gtm' | 'meta' | 'posthog';

interface TrackedEvent {
  id: number;
  platform: Platform;
  eventName: string;
  data: unknown;
  ts: number;
}

interface ServiceStatus {
  gtm: boolean;
  googleAds: boolean;
  posthog: boolean;
  dataLayer: boolean;
}

// ── Gate ────────────────────────────────────────────────────────────

const DEBUG_ALLOWED =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG_TRACKING === 'true';

// ── Test product used by simulate buttons ──────────────────────────

const TEST_PRODUCT = {
  productId: 'price_test_debug_123',
  productName: 'Semaglutide - Monthly (TEST)',
  price: 299,
  planType: 'monthly',
};

// ── Component ──────────────────────────────────────────────────────

export default function DebugTrackingPage() {
  if (!DEBUG_ALLOWED) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-lg text-gray-500">Not available in production.</p>
      </div>
    );
  }

  return <DebugDashboard />;
}

function DebugDashboard() {
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  const [status, setStatus] = useState<ServiceStatus>({
    gtm: false,
    googleAds: false,
    posthog: false,
    dataLayer: false,
  });
  const [filter, setFilter] = useState<Set<Platform>>(new Set(['gtm', 'meta', 'posthog']));
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const seqRef = useRef(0);
  const patchedRef = useRef(false);

  const addEvent = useCallback((platform: Platform, eventName: string, data: unknown) => {
    seqRef.current += 1;
    const id = seqRef.current;
    setEvents((prev) => [{ id, platform, eventName, data, ts: Date.now() }, ...prev].slice(0, 200));
  }, []);

  // ── Patch dataLayer.push & posthog.capture ─────────────────────
  useEffect(() => {
    if (patchedRef.current) return;
    patchedRef.current = true;

    // dataLayer
    window.dataLayer = window.dataLayer || [];
    const origPush = window.dataLayer.push.bind(window.dataLayer);
    window.dataLayer.push = (...args: Record<string, unknown>[]) => {
      for (const arg of args) {
        const name =
          typeof arg === 'object' && arg !== null && 'event' in arg
            ? String(arg.event)
            : 'dataLayer.push';
        const platform: Platform = name.startsWith('meta_') ? 'meta' : 'gtm';
        addEvent(platform, name, arg);
      }
      return origPush(...args);
    };

    // PostHog — wait for it to load, then patch
    const patchPostHog = () => {
      const ph = window.posthog;
      if (ph?.capture && !(ph.capture as any).__dbg) {
        const origCapture = ph.capture.bind(ph);
        const wrapped = (event: string, props?: Record<string, unknown>) => {
          addEvent('posthog', event, { event, ...props });
          return origCapture(event, props);
        };
        (wrapped as any).__dbg = true;
        ph.capture = wrapped;
      }
    };
    patchPostHog();
    const phInterval = setInterval(patchPostHog, 1000);

    return () => clearInterval(phInterval);
  }, [addEvent]);

  // ── Poll service status ────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      setStatus({
        gtm:
          !!(window as any).google_tag_manager ||
          !!document.querySelector('script[src*="googletagmanager"]'),
        googleAds: typeof (window as any).gtag === 'function',
        posthog: !!(window.posthog as any)?.__loaded,
        dataLayer: Array.isArray(window.dataLayer) && window.dataLayer.length > 0,
      });
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  const toggleFilter = (p: Platform) => {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = events.filter((e) => filter.has(e.platform));

  return (
    <div
      className="min-h-screen bg-[#0d1117] text-gray-200"
      style={{ fontFamily: 'ui-monospace, monospace' }}
    >
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-gray-800 bg-[#161b22] px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-bold text-white">Tracking Debug Console</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label="GTM" active={status.gtm} />
            <StatusBadge label="Google Ads" active={status.googleAds} />
            <StatusBadge label="PostHog" active={status.posthog} />
            <StatusBadge label="dataLayer" active={status.dataLayer} />
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 lg:flex-row">
        {/* Sidebar */}
        <div className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
          {/* Filters */}
          <Panel title="Filters">
            <div className="flex flex-col gap-2">
              {(['gtm', 'meta', 'posthog'] as Platform[]).map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filter.has(p)}
                    onChange={() => toggleFilter(p)}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                  />
                  <PlatformTag platform={p} />
                </label>
              ))}
            </div>
          </Panel>

          {/* Simulate */}
          <Panel title="Simulate Events">
            <div className="flex flex-col gap-2">
              <SimButton label="view_item" onClick={() => pushViewItem(TEST_PRODUCT)} />
              <SimButton label="add_to_cart" onClick={() => pushAddToCart(TEST_PRODUCT)} />
              <SimButton
                label="begin_checkout"
                onClick={() => {
                  pushBeginCheckout(TEST_PRODUCT);
                  trackCheckoutStarted({
                    plan_id: TEST_PRODUCT.productId,
                    amount: TEST_PRODUCT.price,
                    currency: 'USD',
                    product_name: TEST_PRODUCT.productName,
                  });
                  trackMetaEvent('InitiateCheckout', {
                    content_ids: [TEST_PRODUCT.productId],
                    value: TEST_PRODUCT.price,
                    currency: 'USD',
                  });
                }}
              />
              <SimButton
                label="add_payment_info"
                onClick={() => {
                  trackPaymentInfoSubmitted({
                    payment_method_type: 'card',
                    plan_id: TEST_PRODUCT.productId,
                    amount: TEST_PRODUCT.price,
                  });
                  trackMetaEvent('AddPaymentInfo', {
                    content_ids: [TEST_PRODUCT.productId],
                    value: TEST_PRODUCT.price,
                    currency: 'USD',
                  });
                }}
              />
              <SimButton
                label="purchase (full)"
                onClick={async () => {
                  const txnId = `test_${Date.now()}`;
                  await pushPurchase({
                    transactionId: txnId,
                    value: TEST_PRODUCT.price,
                    product: TEST_PRODUCT,
                    userData: {
                      email: 'test@wellmedr.com',
                      firstName: 'Test',
                      lastName: 'User',
                      city: 'Miami',
                      state: 'FL',
                      zipCode: '33101',
                    },
                  });
                  trackCheckoutCompleted({
                    order_id: txnId,
                    amount: TEST_PRODUCT.price,
                    currency: 'USD',
                    plan_id: TEST_PRODUCT.productId,
                    payment_method: 'card',
                  });
                  trackMetaEvent('Purchase', {
                    content_ids: [TEST_PRODUCT.productId],
                    content_type: 'product',
                    value: TEST_PRODUCT.price,
                    currency: 'USD',
                    transaction_id: txnId,
                  });
                }}
              />
              <button
                onClick={() => setEvents([])}
                className="mt-2 rounded bg-red-900/40 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-900/60"
              >
                Clear log
              </button>
            </div>
          </Panel>

          {/* Browser Tools */}
          <Panel title="Browser Verification Tools">
            <div className="space-y-3 text-xs leading-relaxed text-gray-400">
              <div>
                <p className="mb-1 font-semibold text-gray-300">GTM Preview Mode</p>
                <p>
                  Go to tagmanager.google.com, open your container, click &quot;Preview&quot;, enter
                  your checkout URL. The debug panel shows every tag that fires.
                </p>
              </div>
              <div>
                <p className="mb-1 font-semibold text-gray-300">Meta Pixel Helper</p>
                <p>
                  Install the &quot;Meta Pixel Helper&quot; Chrome extension. Badge count shows
                  events fired. Click for event names, params, and pixel ID match.
                </p>
              </div>
              <div>
                <p className="mb-1 font-semibold text-gray-300">PostHog Toolbar</p>
                <p>
                  In PostHog dashboard, click &quot;Toolbar&quot;, enter your checkout URL. PostHog
                  overlays an event inspector on the page.
                </p>
              </div>
              <div>
                <p className="mb-1 font-semibold text-gray-300">Google Tag Assistant</p>
                <p>
                  Install &quot;Tag Assistant Companion&quot; Chrome extension. Enable recording,
                  walk through checkout, review the tag timeline.
                </p>
              </div>
            </div>
          </Panel>
        </div>

        {/* Event log */}
        <div className="flex-1">
          <Panel title={`Event Log (${filtered.length})`}>
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                No events yet. Navigate the checkout flow or use the simulate buttons.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {filtered.map((evt) => (
                  <EventRow
                    key={evt.id}
                    evt={evt}
                    expanded={expandedIds.has(evt.id)}
                    onToggle={() => toggleExpand(evt.id)}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      style={{
        borderColor: active ? '#238636' : '#da3633',
        color: active ? '#3fb950' : '#f85149',
        backgroundColor: active ? 'rgba(35,134,54,0.1)' : 'rgba(218,54,51,0.1)',
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: active ? '#3fb950' : '#f85149' }}
      />
      {label}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#161b22]">
      <div className="border-b border-gray-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const PLATFORM_COLORS: Record<Platform, { bg: string; text: string; label: string }> = {
  gtm: { bg: 'rgba(56,139,253,0.15)', text: '#58a6ff', label: 'GTM / GA4' },
  meta: { bg: 'rgba(136,87,255,0.15)', text: '#b083ff', label: 'Meta' },
  posthog: { bg: 'rgba(255,166,0,0.15)', text: '#ffa600', label: 'PostHog' },
};

function PlatformTag({ platform }: { platform: Platform }) {
  const c = PLATFORM_COLORS[platform];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

function SimButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-left text-xs text-gray-300 transition hover:border-gray-600 hover:bg-gray-700"
    >
      {label}
    </button>
  );
}

function EventRow({
  evt,
  expanded,
  onToggle,
}: {
  evt: TrackedEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const time = new Date(evt.ts).toLocaleTimeString('en-US', {
    hour12: false,
    fractionalSecondDigits: 3,
  });

  return (
    <div
      className="cursor-pointer rounded border border-gray-800 transition hover:border-gray-700"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="shrink-0 text-[11px] text-gray-500">{time}</span>
        <PlatformTag platform={evt.platform} />
        <span className="truncate text-sm font-medium text-gray-200">{evt.eventName}</span>
        <span className="ml-auto text-[11px] text-gray-600">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <pre className="max-h-64 overflow-auto border-t border-gray-800 bg-[#0d1117] px-3 py-2 text-[11px] leading-relaxed text-gray-400">
          {JSON.stringify(evt.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
