/**
 * Responsive <picture> (AVIF + WebP) for processed project photos. Also rendered at build time
 * from .astro files (without a client directive it ships no JavaScript).
 */
import type { ImageOut } from '@/lib/api';

interface Props {
  image: ImageOut | null;
  sizes: string;
  alt?: string;
  eager?: boolean;
  class?: string;
  /** Fallback aspect ratio for the placeholder and for images without dimensions. */
  ratio?: [number, number];
}

export function Picture({ image, sizes, alt, eager = false, class: cls = '', ratio = [4, 3] }: Props) {
  if (!image || image.sources.length === 0) return <PhotoPlaceholder class={cls} ratio={ratio} />;
  const srcset = (fmt: 'avif' | 'webp') => image.sources.map((s) => `${s[fmt]} ${s.width}w`).join(', ');
  const fallback = image.sources[1] ?? image.sources[0];
  if (!fallback) return <PhotoPlaceholder class={cls} ratio={ratio} />;
  const width = image.ancho ?? ratio[0] * 400;
  const height = image.alto ?? ratio[1] * 400;
  return (
    <picture>
      <source type="image/avif" srcset={srcset('avif')} sizes={sizes} />
      <source type="image/webp" srcset={srcset('webp')} sizes={sizes} />
      <img
        src={fallback.webp}
        alt={alt ?? image.alt_text}
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        {...(eager ? { fetchpriority: 'high' } : {})}
        class={`h-full w-full object-cover ${cls}`}
      />
    </picture>
  );
}

export function PhotoPlaceholder({ class: cls = '', ratio = [4, 3] }: { class?: string; ratio?: [number, number] }) {
  return (
    <div
      class={`bg-blueprint flex aspect-(--ratio) h-full w-full items-center justify-center text-primary-200 ${cls}`}
      style={{ '--ratio': `${ratio[0]} / ${ratio[1]}` }}
      role="img"
      aria-label="Foto pendiente"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-10 opacity-60"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
      </svg>
    </div>
  );
}
