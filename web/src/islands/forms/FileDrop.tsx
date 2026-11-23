/**
 * Drag-and-drop file field with a "take a photo" button on phones, previews and remove buttons.
 * Files stay in the parent state, so going back and forth between steps keeps them.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ACCEPT, fileProblem, formatSize } from '@/lib/files';

interface Props {
  id: string;
  label: string;
  hint: string;
  optional?: boolean;
  files: File[];
  maxFiles: number;
  onChange: (files: File[]) => void;
  error?: string | undefined;
}

export default function FileDrop({ id, label, hint, optional, files, maxFiles, onChange, error }: Props) {
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const shownError = localError ?? error;
  const full = files.length >= maxFiles;

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const problem = incoming.map(fileProblem).find(Boolean) ?? null;
    if (problem) {
      setLocalError(problem);
      return;
    }
    const next = [...files, ...incoming];
    if (next.length > maxFiles) {
      setLocalError(
        maxFiles === 1 ? 'Podés adjuntar un solo archivo acá.' : `Podés adjuntar hasta ${maxFiles} archivos acá.`,
      );
      return;
    }
    setLocalError(null);
    onChange(next);
  };

  return (
    <fieldset class="flex flex-col gap-2" aria-describedby={`${id}-hint${shownError ? ` ${id}-error` : ''}`}>
      <legend class="mb-1 text-[0.9375rem] font-semibold text-ink">
        {label}
        {optional && <span class="font-normal text-ink-muted"> (opcional)</span>}
      </legend>
      <p id={`${id}-hint`} class="text-sm text-ink-muted">
        {hint}
      </p>

      {!full && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer?.files ?? null);
          }}
          class={`flex flex-col items-center gap-3 rounded-card border-2 border-dashed p-5 text-center transition-colors sm:p-6 ${
            dragging
              ? 'border-primary-600 bg-primary-50'
              : shownError
                ? 'border-danger bg-red-50'
                : 'border-line bg-surface'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            class="size-8 text-primary-600"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <path
              d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <p class="hidden text-sm text-ink-muted [@media(pointer:fine)]:block">Arrastrá el archivo acá o</p>
          <div class="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => pick.current?.click()}
              class="min-h-11 rounded-md border border-primary-600 bg-white px-4 text-[0.9375rem] font-semibold text-primary-700 hover:bg-primary-50"
            >
              Elegir archivo
            </button>
            <button
              type="button"
              onClick={() => camera.current?.click()}
              class="min-h-11 rounded-md bg-primary-600 px-4 text-[0.9375rem] font-semibold text-white hover:bg-primary-700 [@media(pointer:fine)]:hidden"
            >
              Sacar foto
            </button>
          </div>
          <p class="text-xs text-ink-muted">PDF, JPG, PNG, WebP o HEIC · hasta 15 MB</p>
          <input
            ref={pick}
            id={id}
            type="file"
            accept={ACCEPT}
            multiple={maxFiles > 1}
            class="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              add(e.currentTarget.files);
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
              add(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
        </div>
      )}

      {shownError && (
        <p id={`${id}-error`} class="text-sm font-medium text-danger" role="alert">
          {shownError}
        </p>
      )}

      {files.length > 0 && (
        <ul class="flex flex-col gap-2">
          {files.map((f, i) => (
            <FileRow
              key={`${f.name}-${f.size}-${i}`}
              file={f}
              onRemove={() => {
                setLocalError(null);
                onChange(files.filter((_, j) => j !== i));
              }}
            />
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function FileRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/') && !/hei[cf]/i.test(file.type);
  const url = useMemo(() => (isImage ? URL.createObjectURL(file) : null), [file, isImage]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <li class="flex items-center gap-3 rounded-md border border-line bg-white p-2.5">
      {url ? (
        <img src={url} alt="" class="size-12 shrink-0 rounded object-cover" width={48} height={48} />
      ) : (
        <span
          class="grid size-12 shrink-0 place-items-center rounded bg-primary-50 text-xs font-bold text-primary-700"
          aria-hidden="true"
        >
          {file.name.split('.').pop()?.toUpperCase().slice(0, 4) ?? 'DOC'}
        </span>
      )}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[0.9375rem] font-medium">{file.name}</span>
        <span class="text-sm text-ink-muted">{formatSize(file.size)}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        class="grid size-11 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface hover:text-danger"
        aria-label={`Quitar ${file.name}`}
      >
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}
