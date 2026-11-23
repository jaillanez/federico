import { useEffect, useState } from 'preact/hooks';
import { get, type Page, type ProjectSummary } from '../api';
import { Badge, Empty, ErrorBox, PageTitle, Pager, Spinner, fmtDateTime } from '../ui';

export default function Projects() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<ProjectSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), ...(q ? { q } : {}) });
      get<Page<ProjectSummary>>(`/admin/projects?${params}`).then(setData, (e: Error) => setError(e.message));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, page]);
  return (
    <>
      <PageTitle
        actions={
          <a
            href="#/obras/nueva"
            class="inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-semibold text-ink hover:bg-accent-hover"
          >
            + Nueva obra
          </a>
        }
      >
        Obras
      </PageTitle>
      <label for="q" class="sr-only">
        Buscar obras
      </label>
      <input
        id="q"
        type="search"
        placeholder="Buscar por título o localidad…"
        class="mb-4 min-h-11 w-full rounded-md border border-line bg-white px-3"
        value={q}
        onInput={(e) => {
          setQ(e.currentTarget.value);
          setPage(1);
        }}
      />
      <ErrorBox error={error} />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty>No hay obras. Creá la primera con “Nueva obra”.</Empty>
      ) : (
        <>
          <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((p) => (
              <li key={p.id}>
                <a
                  href={`#/obras/${p.id}`}
                  class="flex h-full flex-col overflow-hidden rounded-card border border-line bg-white shadow-card hover:border-primary-300"
                >
                  <div class="bg-blueprint aspect-[16/9]">
                    {p.portada?.sources[0] && (
                      <img
                        src={p.portada.sources[Math.min(1, p.portada.sources.length - 1)]?.webp}
                        alt=""
                        class="h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div class="flex flex-1 flex-col gap-2 p-4">
                    <div class="flex flex-wrap gap-2">
                      <Badge tone={p.publicado ? 'bg-green-50 text-success ring-green-200' : undefined}>
                        {p.publicado ? 'Publicada' : 'Oculta'}
                      </Badge>
                      {p.destacado && <Badge tone="bg-accent-soft text-ink ring-accent/40">Destacada</Badge>}
                    </div>
                    <h2 class="font-display text-lg font-bold">{p.titulo}</h2>
                    <p class="mt-auto text-sm text-ink-muted">
                      {p.cantidad_fotos} fotos · {p.provincia ?? 'Sin provincia'} · {fmtDateTime(p.updated_at)}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
          <Pager page={page} perPage={data.per_page} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
