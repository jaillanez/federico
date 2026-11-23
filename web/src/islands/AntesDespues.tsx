/**
 * Before/after comparison slider. Driven by a native range input, so it works with keyboard
 * (arrows, Home/End) and screen readers out of the box.
 */
import { useState } from 'preact/hooks';
import type { ImageOut } from '@/lib/api';
import { Picture } from './Picture';

interface Props {
  antes: ImageOut;
  despues: ImageOut;
}

export default function AntesDespues({ antes, despues }: Props) {
  const [pos, setPos] = useState(50);
  return (
    <figure class="relative">
      <div
        class="relative aspect-[3/2] overflow-hidden rounded-card outline-offset-2 select-none has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-accent"
        style={{ '--pos': `${pos}%` }}
      >
        <Picture image={despues} sizes="(min-width: 1024px) 66vw, 100vw" />
        <div class="absolute inset-0 [clip-path:inset(0_calc(100%-var(--pos))_0_0)]">
          <Picture image={antes} sizes="(min-width: 1024px) 66vw, 100vw" />
        </div>
        <div
          class="pointer-events-none absolute inset-y-0 left-(--pos) w-0.5 -translate-x-1/2 bg-white shadow"
          aria-hidden="true"
        >
          <span class="absolute top-1/2 left-1/2 grid size-10 -translate-1/2 place-items-center rounded-full bg-white text-ink shadow-lg">
            ⇆
          </span>
        </div>
        <span class="absolute top-3 left-3 rounded bg-ink/80 px-2 py-1 text-xs font-semibold text-white">Antes</span>
        <span class="absolute top-3 right-3 rounded bg-ink/80 px-2 py-1 text-xs font-semibold text-white">Después</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onInput={(e) => setPos(Number(e.currentTarget.value))}
          aria-label="Comparar antes y después"
          aria-valuetext={`${pos}% antes`}
          class="absolute inset-0 h-full w-full cursor-ew-resize opacity-0 focus-visible:opacity-0"
        />
      </div>
      <figcaption class="mt-2 text-sm text-ink-muted">
        Deslizá para comparar. {antes.alt_text} / {despues.alt_text}
      </figcaption>
    </figure>
  );
}
