/** Photo grid of a project page; each photo opens the full-screen viewer. */
import { useState } from 'preact/hooks';
import type { ImageOut } from '@/lib/api';
import { Lightbox } from './Lightbox';
import { Picture } from './Picture';

interface Props {
  images: ImageOut[];
  title: string;
}

export default function FotosObra({ images, title }: Props) {
  const [index, setIndex] = useState<number | null>(null);
  return (
    <>
      <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.id} class={i === 0 ? 'col-span-2 row-span-2' : ''}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              class="group block aspect-square w-full overflow-hidden rounded-md"
              aria-label={`Ampliar foto ${i + 1} de ${images.length}${img.alt_text ? `: ${img.alt_text}` : ''}`}
            >
              <Picture
                image={img}
                sizes={i === 0 ? '(min-width: 1024px) 50vw, 100vw' : '(min-width: 1024px) 25vw, 50vw'}
                eager={i === 0}
                class="transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </button>
          </li>
        ))}
      </ul>
      {index !== null && <Lightbox images={images} title={title} index={index} onClose={() => setIndex(null)} />}
    </>
  );
}
