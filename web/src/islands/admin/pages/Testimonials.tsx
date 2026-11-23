import { useEffect, useState } from 'preact/hooks';
import { ApiError, del, get, patch, post, upload, type Testimonial } from '../api';
import { Badge, Btn, Card, Empty, ErrorBox, PageTitle, Spinner } from '../ui';
import { TextField } from '../../forms/fields';
import { notifyPublicChange } from '../AdminApp';

const blank = { nombre: '', cargo: '', empresa: '', provincia: '', texto: '', publicado: false };

export default function Testimonials() {
  const [items, setItems] = useState<Testimonial[] | null>(null);
  const [editing, setEditing] = useState<string | 'nuevo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => get<Testimonial[]>('/admin/testimonials').then(setItems, (e: Error) => setError(e.message));
  useEffect(() => void load(), []);
  return (
    <>
      <PageTitle
        actions={
          <Btn variant="accent" onClick={() => setEditing('nuevo')}>
            + Nuevo testimonio
          </Btn>
        }
      >
        Testimonios
      </PageTitle>
      <p class="mb-4 text-sm text-ink-muted">Publicá solo testimonios reales, con permiso de la persona.</p>
      <ErrorBox error={error} />
      {editing === 'nuevo' && (
        <Editor
          onDone={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {!items ? (
        <Spinner />
      ) : items.length === 0 && editing !== 'nuevo' ? (
        <Empty>Todavía no hay testimonios.</Empty>
      ) : (
        <ul class="mt-3 flex flex-col gap-3">
          {items.map((t) => (
            <li key={t.id}>
              {editing === t.id ? (
                <Editor
                  item={t}
                  onDone={() => {
                    setEditing(null);
                    void load();
                  }}
                />
              ) : (
                <Card>
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="font-semibold">
                        {t.nombre}{' '}
                        <span class="font-normal text-ink-muted">
                          {[t.cargo, t.empresa].filter(Boolean).join(' · ')}
                        </span>
                      </p>
                      <p class="mt-1 line-clamp-2 text-ink-muted">“{t.texto}”</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <Badge tone={t.publicado ? 'bg-green-50 text-success ring-green-200' : undefined}>
                        {t.publicado ? 'Publicado' : 'Oculto'}
                      </Badge>
                      <Btn size="sm" variant="outline" onClick={() => setEditing(t.id)}>
                        Editar
                      </Btn>
                    </div>
                  </div>
                </Card>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Editor({ item, onDone }: { item?: Testimonial; onDone: () => void }) {
  const [f, setF] = useState(
    item
      ? {
          nombre: item.nombre,
          cargo: item.cargo ?? '',
          empresa: item.empresa ?? '',
          provincia: item.provincia ?? '',
          texto: item.texto,
          publicado: item.publicado,
        }
      : blank,
  );
  const [error, setError] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const save = async (e: Event) => {
    e.preventDefault();
    const body = { ...f, cargo: f.cargo || null, empresa: f.empresa || null, provincia: f.provincia || null };
    try {
      const t = item
        ? await patch<Testimonial>(`/admin/testimonials/${item.id}`, body)
        : await post<Testimonial>('/admin/testimonials', body);
      if (logo) {
        const fd = new FormData();
        fd.append('file', logo);
        await upload(`/admin/testimonials/${t.id}/logo`, fd);
      }
      if (t.publicado || item?.publicado) notifyPublicChange();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    }
  };
  const prefix = item?.id ?? 'nuevo';
  return (
    <Card>
      <form onSubmit={save} class="grid gap-3 sm:grid-cols-2" noValidate>
        <TextField
          id={`${prefix}-nombre`}
          label="Nombre"
          value={f.nombre}
          onInput={(v) => set('nombre', v)}
          maxLength={160}
        />
        <TextField
          id={`${prefix}-cargo`}
          label="Cargo"
          optional
          value={f.cargo}
          onInput={(v) => set('cargo', v)}
          maxLength={120}
        />
        <TextField
          id={`${prefix}-empresa`}
          label="Empresa"
          optional
          value={f.empresa}
          onInput={(v) => set('empresa', v)}
          maxLength={200}
        />
        <TextField
          id={`${prefix}-provincia`}
          label="Provincia"
          optional
          value={f.provincia}
          onInput={(v) => set('provincia', v)}
          maxLength={60}
        />
        <div class="sm:col-span-2">
          <TextField
            id={`${prefix}-texto`}
            label="Testimonio"
            multiline
            value={f.texto}
            onInput={(v) => set('texto', v)}
            maxLength={1500}
          />
        </div>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          Logo de la empresa (opcional)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="text-sm"
            onChange={(e) => setLogo(e.currentTarget.files?.[0] ?? null)}
          />
        </label>
        <label class="flex min-h-11 items-center gap-3 font-semibold">
          <input
            type="checkbox"
            class="size-5 accent-primary-600"
            checked={f.publicado}
            onChange={(e) => set('publicado', e.currentTarget.checked)}
          />
          Publicado
        </label>
        <div class="sm:col-span-2">
          <ErrorBox error={error} />
        </div>
        <div class="flex flex-wrap gap-2 sm:col-span-2">
          <Btn type="submit">Guardar</Btn>
          <Btn variant="outline" onClick={onDone}>
            Cancelar
          </Btn>
          {item && (
            <Btn
              variant="danger"
              onClick={async () => {
                if (confirm('¿Borrar este testimonio?')) {
                  await del(`/admin/testimonials/${item.id}`);
                  if (item.publicado) notifyPublicChange();
                  onDone();
                }
              }}
            >
              Borrar
            </Btn>
          )}
        </div>
      </form>
    </Card>
  );
}
