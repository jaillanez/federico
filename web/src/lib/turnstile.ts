/**
 * Cloudflare Turnstile, invisible mode. The script loads only on pages with a form.
 *
 * Each getToken() renders a fresh widget that runs immediately and is removed afterwards.
 * Reusing one widget with reset() + execute() races (execute can be dropped while the reset is
 * in flight), and tokens are single-use anyway.
 */
interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TOKEN_TIMEOUT_MS = 30_000;
let loading: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => {
      loading = null;
      reject(new Error('No se pudo cargar la verificación anti-spam.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface TurnstileHandle {
  getToken: () => Promise<string>;
  destroy: () => void;
}

export async function createTurnstile(el: HTMLElement, siteKey: string): Promise<TurnstileHandle> {
  const api = await loadScript(); // preload so the submit is fast
  let current: string | null = null;
  const clear = () => {
    if (current) api.remove(current);
    current = null;
  };
  return {
    getToken: () =>
      new Promise<string>((resolve, reject) => {
        clear();
        const timer = setTimeout(() => {
          clear();
          reject(new Error('timeout'));
        }, TOKEN_TIMEOUT_MS);
        const finish = (fn: () => void) => {
          clearTimeout(timer);
          fn();
        };
        current = api.render(el, {
          sitekey: siteKey,
          appearance: 'interaction-only', // invisible unless Cloudflare needs a human check
          language: 'es',
          callback: (token: string) => finish(() => resolve(token)),
          'error-callback': () => finish(() => reject(new Error('captcha'))),
          'timeout-callback': () => finish(() => reject(new Error('timeout'))),
        });
      }),
    destroy: clear,
  };
}
