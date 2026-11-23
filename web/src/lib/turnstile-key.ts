/**
 * Turnstile site key for the build. Without PUBLIC_TURNSTILE_SITE_KEY we use Cloudflare's
 * always-pass invisible TEST key, which only works with the matching test secret on the API.
 */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000BB';

export function turnstileSiteKey(): string {
  const key = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined;
  if (!key) console.warn('[turnstile] PUBLIC_TURNSTILE_SITE_KEY no está definida: se usa la clave de prueba.');
  return key || TURNSTILE_TEST_SITE_KEY;
}
