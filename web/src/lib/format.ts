const LOCALE = 'es-AR';

export const formatUsd = (n: number) =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export const formatNumber = (n: number, decimals = 0) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

/** "2024-05-01" → "mayo de 2024" */
export function formatMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)),
  );
}

/** ISO timestamp → "12 de marzo de 2026" (Argentina time). */
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeZone: 'America/Argentina/San_Juan' }).format(new Date(iso));

/** Minutes to read at ~200 words per minute, at least 1. */
export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
