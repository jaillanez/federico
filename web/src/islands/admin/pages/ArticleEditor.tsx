import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError, del, get, patch, post, upload, type Article } from '../api';
import { go } from '../router';
import { Badge, Btn, Card, ErrorBox, PageTitle, Spinner } from '../ui';
import { TextField } from '../../forms/fields';
import { notifyPublicChange } from '../AdminApp';
import { ESTADO_ART } from './Articles';
import { renderMarkdown } from '@/lib/markdown';

/** ISO → value for <input type="datetime-local"> in local time. */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function ArticleEditor({ id }: { id: string }) {
  const isNew = id === 'nuevo';
  const [article, setArticle] = useState<Article | null>(null);
  const [f, setF] = useState({
    titulo: '',
    slug: '',
    extracto: '',
    cuerpo_md: '',
    tags: '',
    publicado_at: '',
    seo_title: '',
    seo_description: '',
  });
  const [tab, setTab] = useState<'editar' | 'vista'>('editar');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cover = useRef<HTMLInputElement>(null);

  const load = (a: Article) => {
    setArticle(a);
    setF({
      titulo: a.titulo,
      slug: a.slug,
      extracto: a.extracto ?? '',
      cuerpo_md: a.cuerpo_md,
      tags: a.tags.join(', '),
      publicado_at: toLocal(a.publicado_at),
      seo_title: a.seo_title ?? '',
      seo_description: a.seo_description ?? '',
    });
  };
  useEffect(() => {
    if (!isNew) get<Article>(`/admin/articles/${id}`).then(load, (e: Error) => setError(e.message));
  }, [id]);
  const preview = useMemo(() => (tab === 'vista' ? renderMarkdown(f.cuerpo_md).html : ''), [tab, f.cuerpo_md]);
  const set = (k: keyof typeof f, v: string) => {
    setSaved(null);
    setF((s) => ({ ...s, [k]: v }));
  };

  const save = async (e?: Event, publishNow = false) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const when = publishNow ? new Date().toISOString() : f.publicado_at ? new Date(f.publicado_at).toISOString() : null;
    const body = {
      titulo: f.titulo.trim(),
      ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
      extracto: f.extracto.trim() || null,
      cuerpo_md: f.cuerpo_md,
      tags: f.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      publicado_at: when,
      seo_title: f.seo_title.trim() || null,
      seo_description: f.seo_description.trim() || null,
    };
    try {
      const a = isNew
        ? await post<Article>('/admin/articles', body)
        : await patch<Article>(`/admin/articles/${id}`, body);
      const wasLive = article?.estado === 'publicado';
      load(a);
      setSaved(
        a.estado === 'publicado'
          ? 'Publicado. El sitio se va a actualizar en unos minutos.'
          : a.estado === 'programado'
            ? 'Programado.'
            : 'Borrador guardado.',
      );
      if (wasLive || a.estado === 'publicado') notifyPublicChange();
      if (isNew) go(`/articulos/${a.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const sendCover = async (files: FileList | null) => {
    if (!article || !files?.[0]) return;
    const body = new FormData();
    body.append('file', files[0]);
    try {
      load(await upload<Article>(`/admin/articles/${article.id}/cover`, body));
      if (article.estado === 'publicado') notifyPublicChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir la portada.');
    }
  };

  if (!isNew && !article && !error) return <Spinner />;
  return (
    <>
      <a href="#/articulos" class="text-sm font-semibold text-primary-700">
        ← Artículos
      </a>
      <PageTitle
        actions={article && <Badge tone={ESTADO_ART[article.estado].tone}>{ESTADO_ART[article.estado].label}</Badge>}
      >
        {isNew ? 'Nuevo artículo' : f.titulo}
      </PageTitle>
      <form onSubmit={save} class="grid gap-4 lg:grid-cols-[1fr_20rem]" noValidate>
        <div class="flex flex-col gap-4">
          <Card>
            <div class="flex flex-col gap-4">
              <TextField
                id="a-titulo"
                label="Título"
                value={f.titulo}
                onInput={(v) => set('titulo', v)}
                maxLength={200}
              />
              <TextField
                id="a-extracto"
                label="Extracto (aparece en el listado)"
                optional
                multiline
                value={f.extracto}
                onInput={(v) => set('extracto', v)}
                maxLength={500}
              />
            </div>
          </Card>
          <Card>
            <div class="mb-3 flex gap-1" role="tablist" aria-label="Cuerpo del artículo">
              {(['editar', 'vista'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  class="min-h-9 rounded-md px-3 text-sm font-semibold aria-selected:bg-primary-600 aria-selected:text-white"
                >
                  {t === 'editar' ? 'Escribir' : 'Vista previa'}
                </button>
              ))}
            </div>
            {tab === 'editar' ? (
              <>
                <label for="a-cuerpo" class="sr-only">
                  Cuerpo en Markdown
                </label>
                <textarea
                  id="a-cuerpo"
                  rows={18}
                  class="w-full rounded-md border border-line p-3 font-mono text-sm"
                  value={f.cuerpo_md}
                  onInput={(e) => set('cuerpo_md', e.currentTarget.value)}
                />
                <p class="mt-2 text-xs text-ink-muted">
                  Markdown: ## Subtítulo, **negrita**, *cursiva*, - listas, [enlace](https://…).
                </p>
              </>
            ) : (
              <div class="prose-sei" dangerouslySetInnerHTML={{ __html: preview }} />
            )}
          </Card>
        </div>
        <div class="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <div class="flex flex-col gap-3">
              <TextField
                id="a-fecha"
                label="Fecha de publicación"
                optional
                type="datetime-local"
                value={f.publicado_at}
                onInput={(v) => set('publicado_at', v)}
                hint="Vacía = borrador. Una fecha futura lo programa."
              />
              <ErrorBox error={error} />
              {saved && (
                <p role="status" class="text-sm font-medium text-success">
                  {saved}
                </p>
              )}
              <Btn type="submit" disabled={busy || f.titulo.trim().length < 3}>
                {busy ? 'Guardando…' : 'Guardar'}
              </Btn>
              {article?.estado !== 'publicado' && (
                <Btn
                  variant="accent"
                  disabled={busy || f.titulo.trim().length < 3}
                  onClick={() => void save(undefined, true)}
                >
                  Publicar ahora
                </Btn>
              )}
              {article && (
                <Btn
                  variant="danger"
                  onClick={async () => {
                    if (!confirm('¿Borrar este artículo?')) return;
                    await del(`/admin/articles/${article.id}`);
                    if (article.estado === 'publicado') notifyPublicChange();
                    go('/articulos');
                  }}
                >
                  Borrar
                </Btn>
              )}
            </div>
          </Card>
          <Card>
            <h2 class="text-h3">Portada</h2>
            {article?.portada_url && <img src={article.portada_url} alt="" class="mt-3 rounded-md" />}
            {article ? (
              <>
                <Btn variant="outline" class="mt-3 w-full" onClick={() => cover.current?.click()}>
                  {article.portada_url ? 'Cambiar portada' : 'Subir portada'}
                </Btn>
                <input
                  ref={cover}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  class="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    void sendCover(e.currentTarget.files);
                    e.currentTarget.value = '';
                  }}
                />
              </>
            ) : (
              <p class="mt-2 text-sm text-ink-muted">Guardá el artículo para subir la portada.</p>
            )}
          </Card>
          <Card>
            <div class="flex flex-col gap-3">
              <TextField
                id="a-tags"
                label="Etiquetas"
                optional
                hint="Separadas por coma: tarifas, solar"
                value={f.tags}
                onInput={(v) => set('tags', v)}
              />
              <details>
                <summary class="cursor-pointer font-semibold">SEO y dirección web</summary>
                <div class="mt-3 flex flex-col gap-3">
                  <TextField
                    id="a-slug"
                    label="Dirección (slug)"
                    optional
                    value={f.slug}
                    onInput={(v) => set('slug', v)}
                  />
                  <TextField
                    id="a-seo-title"
                    label="Título para Google"
                    optional
                    value={f.seo_title}
                    onInput={(v) => set('seo_title', v)}
                    maxLength={70}
                  />
                  <TextField
                    id="a-seo-desc"
                    label="Descripción para Google"
                    optional
                    multiline
                    value={f.seo_description}
                    onInput={(v) => set('seo_description', v)}
                    maxLength={160}
                  />
                </div>
              </details>
            </div>
          </Card>
        </div>
      </form>
    </>
  );
}
