/** Filter options derived from the published projects (only values that have projects). */
import type { CatalogItem, ProjectSummary } from './api';
import { FOCUS_PROVINCES } from './site';

function uniqueBySlug(items: (CatalogItem | null)[]): CatalogItem[] {
  const map = new Map<string, CatalogItem>();
  for (const it of items) if (it) map.set(it.slug, it);
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function filterOptions(projects: ProjectSummary[]) {
  const focus: readonly string[] = FOCUS_PROVINCES;
  const provincias = [...new Set(projects.map((p) => p.provincia).filter((p): p is string => !!p))].sort(
    (a, b) => Number(focus.includes(b)) - Number(focus.includes(a)) || a.localeCompare(b, 'es'),
  );
  return {
    categorias: uniqueBySlug(projects.map((p) => p.categoria)),
    sectores: uniqueBySlug(projects.map((p) => p.sector)),
    provincias,
  };
}

export function countByProvince(projects: ProjectSummary[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of projects) if (p.provincia) counts[p.provincia] = (counts[p.provincia] ?? 0) + 1;
  return counts;
}
