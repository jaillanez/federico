import { getEntry } from 'astro:content';

/** Page copy from src/content/paginas; fails the build loudly if the file is missing. */
export async function getPage(id: string) {
  const entry = await getEntry('paginas', id);
  if (!entry) throw new Error(`Falta src/content/paginas/${id}.md`);
  return entry.data;
}

/** Astro.site is always set in astro.config.mjs; this narrows the type. */
export function siteUrl(site: URL | undefined): URL {
  if (!site) throw new Error('Configurá `site` en astro.config.mjs');
  return site;
}

export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`No se encontró ${what}`);
  return value;
}
