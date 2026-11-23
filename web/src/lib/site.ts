/**
 * Single source of truth for contact data and global site info.
 * Mirrors the `site_settings` table; in phase 2 the build reads it from
 * GET /api/settings/public and falls back to these defaults.
 */
export interface SiteConfig {
  name: string;
  legalName: string;
  owner: string;
  address: string;
  phone: string;
  mobile: string;
  email: string;
  /** International format, digits only, for wa.me links. */
  whatsapp: string;
  coverage: string[];
}

export const site: SiteConfig = {
  name: 'S.E.I.',
  legalName: 'S.E.I. Servicio Eléctrico Integral',
  owner: 'Ing. Federico Delgado',
  address: 'Brasil 359 (O), San Juan',
  phone: '0264-4220106',
  mobile: '0264 15 5651609',
  email: 'servielect@infovia.com.ar',
  // TODO(federico): confirm WhatsApp number (assumed: the mobile on his card).
  whatsapp: '5492645651609',
  coverage: ['San Juan', 'Mendoza', 'La Rioja', 'Catamarca', 'Todo el país'],
};

export const nav = [
  { href: '/consultoria-solar', label: 'Consultoría solar' },
  { href: '/asesoramiento-tarifario', label: 'Asesoramiento tarifario' },
  { href: '/obras', label: 'Obras' },
  { href: '/cobertura', label: 'Cobertura' },
  { href: '/articulos', label: 'Artículos' },
  { href: '/sobre-federico', label: 'Sobre Federico' },
] as const;

export const legalLinks = [
  { href: '/privacidad', label: 'Política de privacidad' },
  { href: '/confidencialidad', label: 'Confidencialidad' },
] as const;

export const DEFAULT_WHATSAPP_TEXT = 'Hola Federico, te escribo desde la web...';

export function whatsappUrl(text: string = DEFAULT_WHATSAPP_TEXT): string {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;
}

/** "0264-4220106" → "tel:+542644220106" (Argentine landline / mobile). */
export function telHref(local: string): string {
  const digits = local
    .replace(/\D/g, '')
    .replace(/^0/, '')
    .replace(/^(\d{3,4})15/, '9$1');
  return `tel:+54${digits}`;
}
