/**
 * Projects gallery with filters (category, sector, province) kept in the URL query string,
 * so a filtered view can be shared or linked from the coverage map.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CatalogItem, ImageOut, ProjectSummary } from '@/lib/api';
import { Lightbox } from './Lightbox';
import { Picture } from './Picture';

export interface GaleriaItem extends ProjectSummary {
  fotos: ImageOut[];
}

interface Props {
  projects: GaleriaItem[];
  categorias: CatalogItem[];
  sectores: CatalogItem[];
  provincias: string[];
}

type Filters = { categoria: string; sector: string; provincia: string };
const EMPTY: Filters = { categoria: '', sector: '', provincia: '' };
const KEYS = Object.keys(EMPTY) as (keyof Filters)[];

function readUrl(): Filters {
  const q = new URLSearchParams(window.location.search);
  return { categoria: q.get('categoria') ?? '', sector: q.get('sector') ?? '', provincia: q.get('provincia') ?? '' };
}

function writeUrl(f: Filters) {
  const q = new URLSearchParams();
  for (const k of KEYS) if (f[k]) q.set(k, f[k]);
  const qs = q.toString();
  history.replaceState(history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
}

const selectClass =
  'w-full appearance-none rounded-md border border-line bg-white bg-[url(/icons/chevron.svg)] bg-[length:1.25rem] ' +
  'bg-[right_0.75rem_center] bg-no-repeat px-3.5 py-2.5 pr-10 text-base text-ink hover:border-primary-300 ' +
  'focus:border-primary-600 focus:ring-3 focus:ring-primary-100 focus:outline-none';

export default function Galeria({ projects, categorias, sectores, provincias }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [viewer, setViewer] = useState<{ project: GaleriaItem; index: number } | null>(null);

  useEffect(() => setFilters(readUrl()), []);

  const update = (key: keyof Filters, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    writeUrl(next);
  };

  const visible = useMemo(
    () =>
      projects.filter(
        (p) =>
          (!filters.categoria || p.categoria?.slug === filters.categoria) &&
          (!filters.sector || p.sector?.slug === filters.sector) &&
          (!filters.provincia || p.provincia === filters.provincia),
      ),
    [projects, filters],
  );
  const active = KEYS.some((k) => filters[k]);

  return (
    <div>
      <form
        class="grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-3 sm:p-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <FilterSelect
          id="f-categoria"
          label="Tipo de obra"
          value={filters.categoria}
          onChange={(v) => update('categoria', v)}
          options={categorias.map((c) => ({ value: c.slug, label: c.nombre }))}
          all="Todos los tipos"
        />
        <FilterSelect
          id="f-sector"
          label="Sector"
          value={filters.sector}
          onChange={(v) => update('sector', v)}
          options={sectores.map((s) => ({ value: s.slug, label: s.nombre }))}
          all="Todos los sectores"
        />
        <FilterSelect
          id="f-provincia"
          label="Provincia"
          value={filters.provincia}
          onChange={(v) => update('provincia', v)}
          options={provincias.map((p) => ({ value: p, label: p }))}
          all="Todas las provincias"
        />
      </form>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-ink-muted" aria-live="polite">
          {visible.length === 1 ? '1 obra' : `${visible.length} obras`}
          {active ? ' con estos filtros' : ''}
        </p>
        {active && (
          <button
            type="button"
            class="text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
            onClick={() => {
              setFilters(EMPTY);
              writeUrl(EMPTY);
            }}
          >
            Quitar filtros
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p class="mt-6 rounded-card border border-dashed border-line p-8 text-center text-ink-muted">
          No hay obras publicadas con estos filtros todavía.
        </p>
      ) : (
        <ul class="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <li key={p.slug} class="flex flex-col overflow-hidden rounded-card border border-line bg-white shadow-card">
              <div class="relative aspect-[4/3] overflow-hidden">
                {p.fotos.length > 0 ? (
                  <button
                    type="button"
                    class="group block h-full w-full"
                    onClick={() => setViewer({ project: p, index: 0 })}
                    aria-label={`Ver ${p.fotos.length === 1 ? 'la foto' : `las ${p.fotos.length} fotos`} de ${p.titulo}`}
                  >
                    <Picture
                      image={p.portada}
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      class="transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <span class="absolute right-3 bottom-3 rounded bg-ink/80 px-2 py-1 text-xs font-medium text-white">
                      {p.fotos.length} {p.fotos.length === 1 ? 'foto' : 'fotos'}
                    </span>
                  </button>
                ) : (
                  <Picture image={null} sizes="33vw" />
                )}
              </div>
              <div class="flex flex-1 flex-col p-5">
                {p.categoria && <p class="eyebrow">{p.categoria.nombre}</p>}
                <h2 class="mt-2 font-display text-h3 font-bold tracking-tight">
                  <a href={`/obras/${p.slug}`} class="hover:text-primary-700">
                    {p.titulo}
                  </a>
                </h2>
                <p class="mt-2 text-sm text-ink-muted">
                  {[p.localidad, p.provincia].filter(Boolean).join(', ')}
                  {p.potencia_kw ? ` · ${p.potencia_kw.toLocaleString('es-AR')} kW` : ''}
                </p>
                {p.resumen && <p class="mt-3 line-clamp-3 text-[0.9375rem]">{p.resumen}</p>}
                <a
                  href={`/obras/${p.slug}`}
                  class="mt-auto pt-4 text-sm font-semibold text-primary-700"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  Ver obra →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewer && (
        <Lightbox
          images={viewer.project.fotos}
          title={viewer.project.titulo}
          index={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

interface SelectProps {
  id: string;
  label: string;
  value: string;
  all: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

function FilterSelect({ id, label, value, all, options, onChange }: SelectProps) {
  return (
    <div class="flex flex-col gap-1.5">
      <label for={id} class="text-sm font-medium">
        {label}
      </label>
      <select id={id} class={selectClass} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
