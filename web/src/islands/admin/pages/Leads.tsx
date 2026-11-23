import { useEffect, useState } from 'preact/hooks';
import { ESTADOS, get, type LeadSummary, type Page } from '../api';
import { hashQuery } from '../router';
import { Badge, Empty, ErrorBox, PageTitle, Pager, Spinner, fmtDateTime } from '../ui';
import { PROVINCIAS } from '@/lib/provincias';

const control = 'min-h-11 rounded-md border border-line bg-white px-3 text-[0.9375rem]';

export default function Leads() {
  const init = hashQuery();
  const [filters, setFilters] = useState({
    estado: init.get('estado') ?? '',
    provincia: '',
    desde: '',
    hasta: '',
    q: '',
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<LeadSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  useEffect(() => {
    const t = window.setTimeout(() => {
      get<Page<LeadSummary>>(`/admin/leads?${params}&page=${page}`).then(setData, (e: Error) => setError(e.message));
    }, 250); // debounce typing in the search box
    return () => window.clearTimeout(t);
  }, [params.toString(), page]);

  const set = (k: keyof typeof filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  return (
    <>
      <PageTitle
        actions={
          <a
            href={`/api/admin/leads.csv?${params}`}
            class="inline-flex min-h-11 items-center rounded-md border border-line bg-white px-4 font-semibold hover:border-primary-300"
            download
          >
            Exportar CSV
          </a>
        }
      >
        Consultas
      </PageTitle>
      <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label class="sr-only" for="f-q">
          Buscar
        </label>
        <input
          id="f-q"
          type="search"
          placeholder="Buscar empresa, nombre, email…"
          class={`${control} lg:col-span-2`}
          value={filters.q}
          onInput={(e) => set('q', e.currentTarget.value)}
        />
        <label class="sr-only" for="f-estado">
          Estado
        </label>
        <select
          id="f-estado"
          class={control}
          value={filters.estado}
          onChange={(e) => set('estado', e.currentTarget.value)}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label class="sr-only" for="f-prov">
          Provincia
        </label>
        <select
          id="f-prov"
          class={control}
          value={filters.provincia}
          onChange={(e) => set('provincia', e.currentTarget.value)}
        >
          <option value="">Todas las provincias</option>
          {PROVINCIAS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div class="flex gap-2">
          <label class="sr-only" for="f-desde">
            Desde
          </label>
          <input
            id="f-desde"
            type="date"
            class={`${control} min-w-0 flex-1`}
            value={filters.desde}
            onInput={(e) => set('desde', e.currentTarget.value)}
            title="Desde"
          />
          <label class="sr-only" for="f-hasta">
            Hasta
          </label>
          <input
            id="f-hasta"
            type="date"
            class={`${control} min-w-0 flex-1`}
            value={filters.hasta}
            onInput={(e) => set('hasta', e.currentTarget.value)}
            title="Hasta"
          />
        </div>
      </div>
      <ErrorBox error={error} />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty>No hay consultas con estos filtros.</Empty>
      ) : (
        <>
          <p class="mb-2 text-sm text-ink-muted">{data.total} consultas</p>
          <ul class="flex flex-col gap-2">
            {data.items.map((l) => {
              const st = ESTADOS.find((s) => s.value === l.estado);
              return (
                <li key={l.id}>
                  <a
                    href={`#/consultas/${l.id}`}
                    class="flex flex-col gap-1 rounded-card border border-line bg-white p-4 shadow-card hover:border-primary-300 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span class="min-w-0">
                      <span class="block truncate font-semibold">{l.empresa ?? l.contacto_nombre}</span>
                      <span class="block truncate text-sm text-ink-muted">
                        {l.empresa ? `${l.contacto_nombre} · ` : ''}
                        {l.provincia ?? 'Sin provincia'} ·{' '}
                        {l.origen === 'contacto' ? 'Contacto' : `${l.cantidad_archivos} archivo(s)`}
                      </span>
                    </span>
                    <span class="flex shrink-0 items-center gap-3 text-sm">
                      <Badge tone={st?.tone}>{st?.label}</Badge>
                      <span class="text-ink-muted tabular-nums">{fmtDateTime(l.created_at)}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          <Pager page={page} perPage={data.per_page} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
