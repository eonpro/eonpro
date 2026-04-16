export {};

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
      identify: (distinctId: string, properties?: Record<string, unknown>) => void;
      get_distinct_id: () => string;
      [key: string]: unknown;
    };
  }
}
