/** Small UI kit for the admin panel. */
import type { ComponentChildren, JSX } from 'preact';

type BtnProps = JSX.HTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  disabled?: boolean;
};

export function Btn({ variant = 'primary', size = 'md', class: cls = '', type = 'button', ...rest }: BtnProps) {
  const v = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700',
    accent: 'bg-accent text-ink hover:bg-accent-hover',
    outline: 'border border-line bg-white text-ink hover:border-primary-300',
    ghost: 'text-primary-700 hover:bg-primary-50',
    danger: 'border border-red-200 bg-white text-danger hover:bg-red-50',
  }[variant];
  const s = size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-[0.9375rem]';
  return (
    <button
      type={type}
      class={`inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors disabled:opacity-50 ${v} ${s} ${cls}`}
      {...rest}
    />
  );
}

export function Card({ children, class: cls = '' }: { children: ComponentChildren; class?: string }) {
  return <section class={`rounded-card border border-line bg-white p-4 shadow-card sm:p-6 ${cls}`}>{children}</section>;
}

export function PageTitle({ children, actions }: { children: ComponentChildren; actions?: ComponentChildren }) {
  return (
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 tabIndex={-1} class="text-h2 outline-none" data-page-title>
        {children}
      </h1>
      {actions && <div class="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'bg-surface text-ink-muted ring-line',
}: {
  children: ComponentChildren;
  tone?: string | undefined;
}) {
  return (
    <span class={`inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p class="flex items-center gap-2 py-8 text-ink-muted" role="status">
      <span
        class="size-4 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600"
        aria-hidden="true"
      />
      {label}
    </p>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" class="rounded-card border-l-4 border-danger bg-red-50 p-4 text-[0.9375rem]">
      {error}
    </p>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="rounded-card border border-dashed border-line p-8 text-center text-ink-muted">{children}</p>;
}

export function Pager({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav class="mt-4 flex items-center justify-between gap-3" aria-label="Paginación">
      <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Anterior
      </Btn>
      <span class="text-sm text-ink-muted">
        Página {page} de {pages}
      </span>
      <Btn variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Siguiente →
      </Btn>
    </nav>
  );
}

export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/San_Juan',
  }).format(new Date(iso));

export const fmtBytes = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.ceil(n / 1024)} KB`;
