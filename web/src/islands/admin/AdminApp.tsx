/** Admin panel shell: login, navigation (bottom bar on phones), routes and rebuild banner. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, get, post, type RebuildStatus, type User } from './api';
import { go, useRoute } from './router';
import { Btn, Spinner } from './ui';
import { TextField } from '../forms/fields';
import DashboardPage from './pages/Dashboard';
import LeadsPage from './pages/Leads';
import LeadDetailPage from './pages/LeadDetail';
import ProjectsPage from './pages/Projects';
import ProjectEditor from './pages/ProjectEditor';
import ArticlesPage from './pages/Articles';
import ArticleEditor from './pages/ArticleEditor';
import TestimonialsPage from './pages/Testimonials';
import SettingsPage from './pages/Settings';

/** Pages call this after saving public content; the banner then follows the rebuild. */
export const notifyPublicChange = () => window.dispatchEvent(new CustomEvent('sei:saved'));

const NAV = [
  { href: '/', label: 'Inicio', icon: 'M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z', admin: true },
  { href: '/consultas', label: 'Consultas', icon: 'M4 6h16v12H4V6Zm0 0 8 7 8-7', admin: true },
  { href: '/obras', label: 'Obras', icon: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z', admin: false },
  { href: '/articulos', label: 'Artículos', icon: 'M6 3h9l4 4v14H6V3Zm3 7h7m-7 4h7m-7 4h4', admin: false },
  { href: '/testimonios', label: 'Testimonios', icon: 'M4 5h16v11H8l-4 4V5Z', admin: false },
  {
    href: '/configuracion',
    label: 'Ajustes',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3 2-1-2-4-2 1-2-1V3H9v2L7 6 5 5 3 9l2 1v2l-2 1 2 4 2-1 2 1v2h6v-2l2-1 2 1 2-4-2-1v-2Z',
    admin: true,
  },
];

export default function AdminApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    get<User>('/auth/me').then(setUser, () => setUser(null));
    const out = () => setUser(null);
    window.addEventListener('sei:unauthorized', out);
    return () => window.removeEventListener('sei:unauthorized', out);
  }, []);

  if (user === undefined)
    return (
      <div class="p-6">
        <Spinner />
      </div>
    );
  if (user === null) return <Login onLogin={setUser} />;
  return <Shell user={user} onLogout={() => setUser(null)} />;
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await post<User>('/auth/login', { email, password }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo ingresar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main class="bg-blueprint grid min-h-dvh place-items-center p-4">
      <form onSubmit={submit} class="w-full max-w-sm rounded-card bg-white p-6 shadow-xl sm:p-8">
        <p class="eyebrow">S.E.I. · Panel</p>
        <h1 class="mt-2 text-h2">Ingresar</h1>
        <div class="mt-6 flex flex-col gap-4">
          <TextField
            id="login-email"
            label="Email"
            type="email"
            inputMode="email"
            autocomplete="username"
            value={email}
            onInput={setEmail}
          />
          <TextField
            id="login-password"
            label="Contraseña"
            type="password"
            autocomplete="current-password"
            value={password}
            onInput={setPassword}
          />
          {error && (
            <p role="alert" class="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Btn type="submit" disabled={busy || !email || !password}>
            {busy ? 'Ingresando…' : 'Ingresar'}
          </Btn>
        </div>
      </form>
    </main>
  );
}

function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const route = useRoute();
  const isAdmin = user.rol === 'admin';
  const nav = NAV.filter((n) => isAdmin || !n.admin);
  const section = `/${(route[0] ?? '').split('?')[0]}`;
  const main = useRef<HTMLElement>(null);

  // Editors land on their first allowed section.
  useEffect(() => {
    if (!isAdmin && ['/', '/consultas', '/configuracion'].includes(section)) go('/obras');
  }, [isAdmin, section]);
  // Move focus to the page title after navigating (screen readers).
  useEffect(() => {
    requestAnimationFrame(() => main.current?.querySelector<HTMLElement>('[data-page-title]')?.focus());
  }, [route.join('/')]);

  const logout = async () => {
    await post('/auth/logout').catch(() => undefined);
    onLogout();
  };

  const id = route[1]?.split('?')[0];
  let page;
  switch (section) {
    case '/consultas':
      page = id ? <LeadDetailPage id={id} /> : <LeadsPage />;
      break;
    case '/obras':
      page = id ? <ProjectEditor id={id} /> : <ProjectsPage />;
      break;
    case '/articulos':
      page = id ? <ArticleEditor id={id} /> : <ArticlesPage />;
      break;
    case '/testimonios':
      page = <TestimonialsPage />;
      break;
    case '/configuracion':
      page = <SettingsPage />;
      break;
    default:
      page = isAdmin ? <DashboardPage /> : null;
  }

  return (
    <div class="min-h-dvh pb-20 lg:pb-0">
      <header class="sticky top-0 z-30 border-b border-white/10 bg-primary-900 text-white">
        <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <a href="#/" class="font-display text-lg font-extrabold">
            S.E.I. <span class="font-sans text-sm font-medium text-primary-200">Panel</span>
          </a>
          <nav aria-label="Secciones" class="hidden lg:block">
            <ul class="flex gap-1">
              {nav.map((n) => (
                <li key={n.href}>
                  <a
                    href={`#${n.href}`}
                    aria-current={section === n.href ? 'page' : undefined}
                    class="rounded-md px-3 py-2 text-sm font-medium text-primary-100 hover:bg-white/10 aria-[current=page]:bg-white/15 aria-[current=page]:text-white"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div class="flex items-center gap-3">
            <a
              href="/"
              target="_blank"
              class="hidden text-sm text-primary-100 underline-offset-4 hover:underline sm:inline"
            >
              Ver sitio ↗
            </a>
            <span class="hidden text-sm text-primary-200 md:inline">{user.nombre}</span>
            <button
              type="button"
              onClick={logout}
              class="min-h-9 rounded-md border border-white/30 px-3 text-sm font-semibold hover:bg-white/10"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <RebuildBanner />
      <main ref={main} class="mx-auto max-w-6xl px-4 py-6">
        {page}
      </main>
      <nav aria-label="Secciones (móvil)" class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white lg:hidden">
        <ul class={`grid ${nav.length > 4 ? 'grid-cols-6' : 'grid-cols-3'}`}>
          {nav.map((n) => (
            <li key={n.href}>
              <a
                href={`#${n.href}`}
                aria-current={section === n.href ? 'page' : undefined}
                class="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-ink-muted aria-[current=page]:text-primary-700"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d={n.icon} />
                </svg>
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** "The site is updating" banner: follows the debounced rebuild after any public change. */
function RebuildBanner() {
  const [status, setStatus] = useState<RebuildStatus | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const poll = async () => {
    window.clearTimeout(timer.current);
    try {
      const s = await get<RebuildStatus>('/admin/rebuild');
      setStatus(s);
      if (s.pending) timer.current = window.setTimeout(poll, 5000);
    } catch {
      /* ignore: banner is informative */
    }
  };
  useEffect(() => {
    const on = () => void poll();
    window.addEventListener('sei:saved', on);
    void poll();
    return () => {
      window.removeEventListener('sei:saved', on);
      window.clearTimeout(timer.current);
    };
  }, []);
  if (!status?.pending) return null;
  const secs = status.scheduled_for
    ? Math.max(0, Math.round((new Date(status.scheduled_for).getTime() - Date.now()) / 1000))
    : null;
  return (
    <div role="status" class="border-b border-accent/40 bg-accent-soft">
      <p class="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm">
        <span class="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
        El sitio se está actualizando{secs ? ` (empieza en ${secs} s; tarda 1 a 2 minutos)` : '…'}. Los cambios se ven
        en el sitio público al terminar.
      </p>
    </div>
  );
}
