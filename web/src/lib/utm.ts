/** UTM parameters of the landing page, kept for the session so the lead can record them. */
const KEY = 'sei:utm';
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
export type Utm = Partial<Record<(typeof FIELDS)[number], string>>;

export function captureUtm(): void {
  try {
    const q = new URLSearchParams(location.search);
    const utm: Utm = {};
    for (const f of FIELDS) {
      const v = q.get(f);
      if (v) utm[f] = v.slice(0, 100);
    }
    if (Object.keys(utm).length) sessionStorage.setItem(KEY, JSON.stringify(utm));
  } catch {
    // Storage can be blocked (private mode); UTMs are optional.
  }
}

export function readUtm(): Utm {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Utm;
  } catch {
    return {};
  }
}
