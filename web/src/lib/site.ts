/**
 * Defaults for contact data and global site info. The build overrides them with the values of
 * `site_settings` (GET /api/settings/public, see lib/api.ts → getSiteData). Templates must read
 * contact data from there, never hard-code it.
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

export const defaultSite: SiteConfig = {
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

export const FOCUS_PROVINCES = ['San Juan', 'Mendoza', 'La Rioja', 'Catamarca'] as const;

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
export const INVOICE_WHATSAPP_TEXT =
  'Hola Federico, te adjunto la factura de mi empresa para un diagnóstico tarifario/solar';

export function whatsappUrl(number: string, text: string = DEFAULT_WHATSAPP_TEXT): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** "0264-4220106" → "tel:+542644220106"; "0264 15 5651609" → "tel:+5492645651609". */
export function telHref(local: string): string {
  const digits = local
    .replace(/\D/g, '')
    .replace(/^0/, '')
    .replace(/^(\d{3,4})15/, '9$1');
  return `tel:+54${digits}`;
}
