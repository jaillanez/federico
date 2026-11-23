/** Project photos: multi-upload (files or camera) with progress, reorder (drag or arrows),
 * cover, alt text, before/after type and delete. Polls while photos are being processed. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, del, get, patch, post, upload, type AdminImage, type Project } from '../api';
import { Btn, Card, ErrorBox } from '../ui';

interface Props {
  project: Project;
  onChange: (p: Project) => void;
}

export default function Photos({ project, onChange }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const images = project.imagenes;
  const processing = images.some((i) => i.procesando);

  const refresh = async () => onChange(await get<Project>(`/admin/projects/${project.id}`));

  // Poll until the background processing finishes.
  useEffect(() => {
    if (!processing) return;
    const t = window.setTimeout(() => void refresh(), 2500);
    return () => window.clearTimeout(t);
  }, [processing, project]);

  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    const body = new FormData();
    Array.from(files)
      .slice(0, 20)
      .forEach((f) => body.append('files', f, f.name));
    setError(null);
    setProgress(0);
    try {
      await upload(`/admin/projects/${project.id}/images`, body, setProgress);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron subir las fotos.');
    } finally {
      setProgress(null);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    }
  };

  const reorder = (ids: string[]) => act(() => post(`/admin/projects/${project.id}/images/order`, { ids }));
  const move = (from: number, to: number) => {
    const ids = images.map((i) => i.id);
    const [m] = ids.splice(from, 1);
    if (m) ids.splice(to, 0, m);
    void reorder(ids);
  };

  return (
    <Card>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-h3">Fotos ({images.length})</h2>
        <div class="flex gap-2">
          <Btn variant="primary" onClick={() => camera.current?.click()} class="[@media(pointer:fine)]:hidden">
            Sacar foto
          </Btn>
          <Btn variant="outline" onClick={() => pick.current?.click()}>
            Subir fotos
          </Btn>
        </div>
        <input
          ref={pick}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          class="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void send(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          class="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void send(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />
      </div>
      <div
        class="mt-3 rounded-md border-2 border-dashed border-line p-4 text-center text-sm text-ink-muted [@media(pointer:coarse)]:hidden"
        onDragOver={(e) => {
          if (!dragId) e.preventDefault();
        }}
        onDrop={(e) => {
          if (dragId) return;
          e.preventDefault();
          void send(e.dataTransfer?.files ?? null);
        }}
      >
        Arrastrá fotos acá (JPG, PNG o WebP; hasta 20 por vez). Se les borra la ubicación GPS automáticamente.
      </div>
      {progress !== null && (
        <div class="mt-3" role="status">
          <div class="h-2 overflow-hidden rounded-full bg-line">
            <div class="h-full w-(--p) bg-primary-600" style={{ '--p': `${Math.round(progress * 100)}%` }} />
          </div>
          <p class="mt-1 text-sm text-ink-muted">Subiendo… {Math.round(progress * 100)}%</p>
        </div>
      )}
      {processing && (
        <p class="mt-3 text-sm text-ink-muted" role="status">
          Procesando fotos (achicando y quitando datos de ubicación)…
        </p>
      )}
      <div class="mt-3">
        <ErrorBox error={error} />
      </div>
      <ul class="mt-4 grid gap-3 sm:grid-cols-2">
        {images.map((img, i) => (
          <PhotoItem
            key={img.id}
            img={img}
            index={i}
            total={images.length}
            onMove={move}
            onAct={act}
            dragging={dragId === img.id}
            onDragStart={() => setDragId(img.id)}
            onDragEnd={() => setDragId(null)}
            onDropOn={() => {
              if (dragId && dragId !== img.id)
                move(
                  images.findIndex((x) => x.id === dragId),
                  i,
                );
              setDragId(null);
            }}
          />
        ))}
      </ul>
    </Card>
  );
}

interface ItemProps {
  img: AdminImage;
  index: number;
  total: number;
  dragging: boolean;
  onMove: (from: number, to: number) => void;
  onAct: (fn: () => Promise<unknown>) => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}

function PhotoItem({ img, index, total, dragging, onMove, onAct, onDragStart, onDragEnd, onDropOn }: ItemProps) {
  const [alt, setAlt] = useState(img.alt_text);
  useEffect(() => setAlt(img.alt_text), [img.alt_text]);
  const thumb = img.sources[Math.min(1, img.sources.length - 1)]?.webp;
  return (
    <li
      draggable={!img.procesando}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropOn();
      }}
      class={`flex gap-3 rounded-md border bg-white p-2 ${img.es_portada ? 'border-primary-600' : 'border-line'} ${dragging ? 'opacity-50' : ''}`}
    >
      <div class="bg-blueprint relative size-24 shrink-0 cursor-grab overflow-hidden rounded">
        {img.procesando ? (
          <span class="grid h-full place-items-center text-xs text-primary-100">Procesando…</span>
        ) : (
          thumb && <img src={thumb} alt="" class="h-full w-full object-cover" loading="lazy" />
        )}
        {img.es_portada && (
          <span class="absolute bottom-1 left-1 rounded bg-primary-600 px-1.5 text-[0.6875rem] font-semibold text-white">
            Portada
          </span>
        )}
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <label class="sr-only" for={`alt-${img.id}`}>
          Texto alternativo de la foto {index + 1}
        </label>
        <input
          id={`alt-${img.id}`}
          class="min-h-9 w-full rounded border border-line px-2 text-sm"
          placeholder="Describí la foto (para accesibilidad y Google)"
          value={alt}
          maxLength={250}
          onInput={(e) => setAlt(e.currentTarget.value)}
          onBlur={() => alt !== img.alt_text && void onAct(() => patch(`/admin/images/${img.id}`, { alt_text: alt }))}
        />
        <div class="flex flex-wrap items-center gap-1">
          <label class="sr-only" for={`tipo-${img.id}`}>
            Tipo
          </label>
          <select
            id={`tipo-${img.id}`}
            class="min-h-9 rounded border border-line px-1 text-sm"
            value={img.tipo}
            onChange={(e) => void onAct(() => patch(`/admin/images/${img.id}`, { tipo: e.currentTarget.value }))}
          >
            <option value="general">General</option>
            <option value="antes">Antes</option>
            <option value="despues">Después</option>
          </select>
          {!img.es_portada && !img.procesando && (
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => void onAct(() => patch(`/admin/images/${img.id}`, { es_portada: true }))}
            >
              Portada
            </Btn>
          )}
          <Btn
            size="sm"
            variant="ghost"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            aria-label={`Mover foto ${index + 1} antes`}
          >
            ↑
          </Btn>
          <Btn
            size="sm"
            variant="ghost"
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
            aria-label={`Mover foto ${index + 1} después`}
          >
            ↓
          </Btn>
          <Btn
            size="sm"
            variant="ghost"
            class="text-danger"
            aria-label={`Borrar foto ${index + 1}`}
            onClick={() => confirm('¿Borrar esta foto?') && void onAct(() => del(`/admin/images/${img.id}`))}
          >
            Borrar
          </Btn>
        </div>
      </div>
    </li>
  );
}
