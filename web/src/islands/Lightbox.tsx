/**
 * Full-screen photo viewer on a native <dialog>: focus trap and Esc for free,
 * ←/→ keys, swipe gestures, and a live "n de m" counter for screen readers.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ImageOut } from '@/lib/api';
import { Picture } from './Picture';

interface Props {
  images: ImageOut[];
  title: string;
  /** Index to open, or null when closed. */
  index: number | null;
  onClose: () => void;
}

const SWIPE_PX = 40;

export function Lightbox({ images, title, index, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState(index ?? 0);
  const touchX = useRef<number | null>(null);
  const total = images.length;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (index !== null) {
      setCurrent(index);
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [index]);

  const go = (delta: number) => setCurrent((c) => (c + delta + total) % total);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };

  const image = images[current] ?? null;

  return (
    <dialog
      ref={dialog}
      aria-label={`Fotos: ${title}`}
      class="m-0 h-dvh max-h-none w-screen max-w-none bg-ink/95 p-0 text-white backdrop:bg-ink/80"
      onClose={onClose}
      onKeyDown={onKey}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        if (start !== null && end !== undefined && Math.abs(end - start) > SWIPE_PX) go(end < start ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div class="flex h-full flex-col">
        <div class="flex items-center justify-between gap-4 p-3 sm:p-4">
          <p class="truncate text-sm font-medium" aria-live="polite">
            {title} · {current + 1} de {total}
          </p>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            class="grid size-11 shrink-0 place-items-center rounded-md hover:bg-white/10"
            aria-label="Cerrar visor"
            autofocus
          >
            <svg
              viewBox="0 0 24 24"
              class="size-6"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <figure class="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
          <div class="h-full max-h-full w-full [&_img]:object-contain">
            <Picture image={image} sizes="100vw" eager ratio={[3, 2]} />
          </div>
          {image?.alt_text && <figcaption class="sr-only">{image.alt_text}</figcaption>}
          {total > 1 && (
            <>
              <NavButton dir={-1} onClick={() => go(-1)} />
              <NavButton dir={1} onClick={() => go(1)} />
            </>
          )}
        </figure>
        {image?.tipo !== 'general' && image && (
          <p class="p-3 text-center text-sm text-primary-100">{image.tipo === 'antes' ? 'Antes' : 'Después'}</p>
        )}
      </div>
    </dialog>
  );
}

function NavButton({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? 'Foto siguiente' : 'Foto anterior'}
      class={`absolute top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-ink/60 hover:bg-ink ${dir === 1 ? 'right-2 sm:right-4' : 'left-2 sm:left-4'}`}
    >
      <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d={dir === 1 ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
      </svg>
    </button>
  );
}
