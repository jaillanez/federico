import { useEffect, useState } from 'preact/hooks';
import { get, type Article, type Page } from '../api';
import { Badge, Empty, ErrorBox, PageTitle, Spinner, fmtDateTime } from '../ui';

export const ESTADO_ART = {
  borrador: { label: 'Borrador', tone: 'bg-surface text-ink-muted ring-line' },
  programado: { label: 'Programado', tone: 'bg-accent-soft text-ink ring-accent/40' },
  publicado: { label: 'Publicado', tone: 'bg-green-50 text-success ring-green-200' },
} as const;

export default function Articles() {
  const [data, setData] = useState<Page<Article> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<Page<Article>>('/admin/articles?per_page=50').then(setData, (e: Error) => setError(e.message));
  }, []);
  return (
    <>
      <PageTitle
        actions={
          <a
            href="#/articulos/nuevo"
            class="inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-semibold text-ink hover:bg-accent-hover"
          >
            + Nuevo artículo
          </a>
        }
      >
        Artículos
      </PageTitle>
      <ErrorBox error={error} />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty>Todavía no hay artículos.</Empty>
      ) : (
        <ul class="flex flex-col gap-2">
          {data.items.map((a) => (
            <li key={a.id}>
              <a
                href={`#/articulos/${a.id}`}
                class="flex flex-col gap-1 rounded-card border border-line bg-white p-4 shadow-card hover:border-primary-300 sm:flex-row sm:items-center sm:justify-between"
              >
                <span class="font-semibold">{a.titulo}</span>
                <span class="flex shrink-0 items-center gap-3 text-sm text-ink-muted">
                  <Badge tone={ESTADO_ART[a.estado].tone}>{ESTADO_ART[a.estado].label}</Badge>
                  {a.publicado_at ? fmtDateTime(a.publicado_at) : 'Sin fecha'}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
