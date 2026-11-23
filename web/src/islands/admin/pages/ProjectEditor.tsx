import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, get, patch, post, del, type CatalogItem, type Project } from '../api';
import { go } from '../router';
import { Btn, Card, ErrorBox, PageTitle, Spinner } from '../ui';
import { TextField } from '../../forms/fields';
import { notifyPublicChange } from '../AdminApp';
import Photos from './Photos';
import { PROVINCIAS } from '@/lib/provincias';

type Form = Record<
  | 'titulo'
  | 'slug'
  | 'resumen'
  | 'problema'
  | 'solucion'
  | 'resultado'
  | 'provincia'
  | 'localidad'
  | 'lat'
  | 'lng'
  | 'categoria'
  | 'sector'
  | 'fecha_obra'
  | 'potencia_kw'
  | 'seo_title'
  | 'seo_description',
  string
> & { publicado: boolean; destacado: boolean };

const EMPTY: Form = {
  titulo: '',
  slug: '',
  resumen: '',
  problema: '',
  solucion: '',
  resultado: '',
  provincia: '',
  localidad: '',
  lat: '',
  lng: '',
  categoria: '',
  sector: '',
  fecha_obra: '',
  potencia_kw: '',
  seo_title: '',
  seo_description: '',
  publicado: false,
  destacado: false,
};

const toForm = (p: Project): Form => ({
  titulo: p.titulo,
  slug: p.slug,
  resumen: p.resumen ?? '',
  problema: p.problema ?? '',
  solucion: p.solucion ?? '',
  resultado: p.resultado ?? '',
  provincia: p.provincia ?? '',
  localidad: p.localidad ?? '',
  lat: p.lat?.toString() ?? '',
  lng: p.lng?.toString() ?? '',
  categoria: p.categoria?.slug ?? '',
  sector: p.sector?.slug ?? '',
  fecha_obra: p.fecha_obra ?? '',
  potencia_kw: p.potencia_kw?.toString() ?? '',
  seo_title: p.seo_title ?? '',
  seo_description: p.seo_description ?? '',
  publicado: p.publicado,
  destacado: p.destacado,
});

function toBody(f: Form) {
  const text = (v: string) => v.trim() || null;
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  return {
    titulo: f.titulo.trim(),
    ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
    resumen: text(f.resumen),
    problema: text(f.problema),
    solucion: text(f.solucion),
    resultado: text(f.resultado),
    provincia: text(f.provincia),
    localidad: text(f.localidad),
    lat: num(f.lat),
    lng: num(f.lng),
    categoria: text(f.categoria),
    sector: text(f.sector),
    fecha_obra: text(f.fecha_obra),
    potencia_kw: num(f.potencia_kw),
    seo_title: text(f.seo_title),
    seo_description: text(f.seo_description),
    publicado: f.publicado,
    destacado: f.destacado,
  };
}

const sel = 'min-h-11 w-full rounded-md border border-line bg-white px-3';

export default function ProjectEditor({ id }: { id: string }) {
  const isNew = id === 'nueva';
  const [project, setProject] = useState<Project | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [catalog, setCatalog] = useState<{ categorias: CatalogItem[]; sectores: CatalogItem[] } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    get<typeof catalog>('/admin/catalog').then(setCatalog, () => undefined);
    if (!isNew)
      get<Project>(`/admin/projects/${id}`).then(
        (p) => {
          setProject(p);
          setForm(toForm(p));
        },
        (e: Error) => setError(e.message),
      );
  }, [id]);

  const set = (k: keyof Form, v: string | boolean) => {
    dirty.current = true;
    setSaved(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const save = async (e?: Event, override?: Partial<Form>) => {
    e?.preventDefault();
    const data = { ...form, ...override };
    if (data.titulo.trim().length < 3) {
      setErrors({ titulo: 'Escribí un título de al menos 3 letras.' });
      document.getElementById('titulo')?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const p = isNew
        ? await post<Project>('/admin/projects', toBody(data))
        : await patch<Project>(`/admin/projects/${id}`, toBody(data));
      dirty.current = false;
      setProject(p);
      setForm(toForm(p));
      setSaved(
        p.publicado ? 'Guardado. El sitio se va a actualizar en unos minutos.' : 'Guardado (la obra está oculta).',
      );
      if (p.publicado || project?.publicado) notifyPublicChange();
      if (isNew) go(`/obras/${p.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else setError('No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!project || !confirm(`¿Borrar “${project.titulo}” y todas sus fotos? No se puede deshacer.`)) return;
    await del(`/admin/projects/${project.id}`);
    if (project.publicado) notifyPublicChange();
    go('/obras');
  };

  if (!isNew && !project && !error) return <Spinner />;

  const field = (k: keyof Form, label: string, extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
    <TextField
      id={k}
      label={label}
      value={form[k] as string}
      onInput={(v) => set(k, v)}
      error={errors[k]}
      optional
      {...extra}
    />
  );

  return (
    <>
      <a href="#/obras" class="text-sm font-semibold text-primary-700">
        ← Obras
      </a>
      <PageTitle
        actions={
          project && (
            <a
              href={`/obras/${project.slug}`}
              target="_blank"
              class="inline-flex min-h-11 items-center rounded-md border border-line bg-white px-4 font-semibold"
            >
              Ver en el sitio ↗
            </a>
          )
        }
      >
        {isNew ? 'Nueva obra' : form.titulo || 'Obra'}
      </PageTitle>
      <form onSubmit={save} class="grid gap-4 lg:grid-cols-[1fr_20rem]" noValidate>
        <div class="flex flex-col gap-4">
          <Card>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">{field('titulo', 'Título', { optional: false, maxLength: 200 })}</div>
              {field('resumen', 'Resumen (1 o 2 frases)', { multiline: true, maxLength: 1000 })}
              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1.5">
                  <label for="categoria" class="text-sm font-medium">
                    Tipo de obra
                  </label>
                  <select
                    id="categoria"
                    class={sel}
                    value={form.categoria}
                    onChange={(e) => set('categoria', e.currentTarget.value)}
                  >
                    <option value="">Sin categoría</option>
                    {catalog?.categorias.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label for="sector" class="text-sm font-medium">
                    Sector
                  </label>
                  <select
                    id="sector"
                    class={sel}
                    value={form.sector}
                    onChange={(e) => set('sector', e.currentTarget.value)}
                  >
                    <option value="">Sin sector</option>
                    {catalog?.sectores.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <h2 class="text-h3">Problema → solución → resultado</h2>
            <div class="mt-4 flex flex-col gap-4">
              {field('problema', 'El problema', { multiline: true, maxLength: 5000 })}
              {field('solucion', 'La solución', { multiline: true, maxLength: 5000 })}
              {field('resultado', 'El resultado', { multiline: true, maxLength: 5000 })}
            </div>
          </Card>
          {project ? (
            <Photos
              project={project}
              onChange={(p) => {
                setProject(p);
                if (p.publicado) notifyPublicChange();
              }}
            />
          ) : (
            <Card>
              <p class="text-ink-muted">Guardá la obra para poder subir fotos.</p>
            </Card>
          )}
        </div>
        <div class="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <div class="flex flex-col gap-3">
              <label class="flex min-h-11 items-center gap-3 font-semibold">
                <input
                  type="checkbox"
                  class="size-5 accent-primary-600"
                  checked={form.publicado}
                  onChange={(e) => set('publicado', e.currentTarget.checked)}
                />
                Publicada en el sitio
              </label>
              <label class="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  class="size-5 accent-primary-600"
                  checked={form.destacado}
                  onChange={(e) => set('destacado', e.currentTarget.checked)}
                />
                Destacada en el inicio
              </label>
              <ErrorBox error={error} />
              {saved && (
                <p role="status" class="text-sm font-medium text-success">
                  {saved}
                </p>
              )}
              <Btn type="submit" variant="accent" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar'}
              </Btn>
              {project && (
                <Btn variant="danger" onClick={remove}>
                  Borrar obra
                </Btn>
              )}
            </div>
          </Card>
          <Card>
            <h2 class="text-h3">Datos</h2>
            <div class="mt-3 flex flex-col gap-3">
              <div class="flex flex-col gap-1.5">
                <label for="provincia" class="text-sm font-medium">
                  Provincia
                </label>
                <select
                  id="provincia"
                  class={sel}
                  value={form.provincia}
                  onChange={(e) => set('provincia', e.currentTarget.value)}
                >
                  <option value="">Sin provincia</option>
                  {PROVINCIAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              {field('localidad', 'Localidad', { maxLength: 120 })}
              {field('potencia_kw', 'Potencia (kW)', { inputMode: 'numeric' })}
              {field('fecha_obra', 'Fecha de la obra', { type: 'date' })}
              <div class="grid grid-cols-2 gap-2">
                {field('lat', 'Latitud', { hint: 'Ej. -31.54' })}
                {field('lng', 'Longitud', { hint: 'Ej. -68.53' })}
              </div>
            </div>
          </Card>
          <Card>
            <details>
              <summary class="cursor-pointer font-semibold">SEO y dirección web</summary>
              <div class="mt-3 flex flex-col gap-3">
                {field('slug', 'Dirección (slug)', { hint: 'Se genera del título si lo dejás vacío.' })}
                {field('seo_title', 'Título para Google', { maxLength: 70 })}
                {field('seo_description', 'Descripción para Google', { multiline: true, maxLength: 160 })}
              </div>
            </details>
          </Card>
        </div>
      </form>
    </>
  );
}
