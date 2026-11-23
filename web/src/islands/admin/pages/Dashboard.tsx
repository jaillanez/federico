import { useEffect, useState } from 'preact/hooks';
import { get, type Dashboard as D } from '../api';
import { Card, ErrorBox, PageTitle, Spinner, fmtDateTime } from '../ui';

export default function Dashboard() {
  const [data, setData] = useState<D | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<D>('/admin/dashboard').then(setData, (e: Error) => setError(e.message));
  }, []);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  const provinces = Object.entries(data.semana_por_provincia);
  const max = Math.max(1, ...provinces.map(([, n]) => n));
  return (
    <>
      <PageTitle>Inicio</PageTitle>
      <div class="grid gap-4 sm:grid-cols-2">
        <a
          href="#/consultas?estado=nuevo"
          class="rounded-card border border-line bg-white p-5 shadow-card hover:border-primary-300"
        >
          <p class="text-sm text-ink-muted">Consultas nuevas sin responder</p>
          <p class="mt-1 font-display text-display font-extrabold text-primary-700">{data.consultas_nuevas}</p>
        </a>
        <div class="rounded-card border border-line bg-white p-5 shadow-card">
          <p class="text-sm text-ink-muted">Consultas de los últimos 7 días</p>
          <p class="mt-1 font-display text-display font-extrabold">{data.consultas_semana}</p>
        </div>
      </div>
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 class="text-h3">Esta semana, por provincia</h2>
          {provinces.length === 0 ? (
            <p class="mt-3 text-ink-muted">Sin consultas en los últimos 7 días.</p>
          ) : (
            <ul class="mt-4 flex flex-col gap-3">
              {provinces.map(([prov, n]) => (
                <li key={prov} class="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-sm">
                  <span class="truncate">{prov}</span>
                  <span class="h-2.5 rounded-full bg-surface" aria-hidden="true">
                    <span
                      class="block h-full w-(--w) rounded-full bg-primary-600"
                      style={{ '--w': `${(n / max) * 100}%` }}
                    />
                  </span>
                  <span class="text-right font-semibold tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div class="flex items-center justify-between">
            <h2 class="text-h3">Últimas obras editadas</h2>
            <a href="#/obras/nueva" class="text-sm font-semibold text-primary-700">
              + Nueva obra
            </a>
          </div>
          <ul class="mt-3 divide-y divide-line">
            {data.ultimas_obras.map((p) => (
              <li key={p.id}>
                <a
                  href={`#/obras/${p.id}`}
                  class="flex min-h-12 items-center justify-between gap-3 hover:text-primary-700"
                >
                  <span class="truncate">{p.titulo}</span>
                  <span class="shrink-0 text-xs text-ink-muted">
                    {p.publicado ? 'Publicada' : 'Oculta'} · {fmtDateTime(p.updated_at)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
