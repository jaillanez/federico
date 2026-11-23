/**
 * Cookie-less analytics events. Works with Plausible or Umami if their script is on the page;
 * otherwise it is a no-op. TODO: choose Plausible or self-hosted Umami (pending decision).
 */
export type AnalyticsEvent = 'lead_enviado' | 'whatsapp_click' | 'simulador_usado';

interface AnalyticsWindow {
  plausible?: (event: string, options?: { props?: Record<string, string> }) => void;
  umami?: { track: (event: string, data?: Record<string, string>) => void };
}

export function track(event: AnalyticsEvent, props?: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as AnalyticsWindow;
  try {
    w.plausible?.(event, props ? { props } : undefined);
    w.umami?.track(event, props);
  } catch {
    // Analytics must never break the page.
  }
}
