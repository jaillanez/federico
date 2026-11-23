/**
 * Build-time client for the public API. Only used while rendering pages (never in the browser).
 *
 * If the API is unreachable the build FAILS, so we never publish an empty site by accident.
 * Set SEI_OFFLINE_BUILD=1 to build with empty data (e.g. a quick UI check without the API).
 */
import { defaultSite, type SiteConfig } from './site';

export interface CatalogItem {
  slug: string;
  nombre: string;
}
export interface ImageSource {
  width: number;
  avif: string;
  webp: string;
}
export interface ImageOut {
  id: string;
  alt_text: string;
  ancho: number | null;
  alto: number | null;
  es_portada: boolean;
  tipo: 'general' | 'antes' | 'despues';
  sources: ImageSource[];
}
export interface ProjectSummary {
  slug: string;
  titulo: string;
  resumen: string | null;
  provincia: string | null;
  localidad: string | null;
  fecha_obra: string | null;
  potencia_kw: number | null;
  destacado: boolean;
  categoria: CatalogItem | null;
  sector: CatalogItem | null;
  portada: ImageOut | null;
  cantidad_fotos: number;
}
export interface ProjectDetail extends ProjectSummary {
  problema: string | null;
  solucion: string | null;
  resultado: string | null;
  lat: number | null;
  lng: number | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
  imagenes: ImageOut[];
}
export interface ArticleSummary {
  slug: string;
  titulo: string;
  extracto: string | null;
  portada_url: string | null;
  tags: string[];
  publicado_at: string;
}
export interface ArticleDetail extends ArticleSummary {
  cuerpo_md: string;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
}
export interface Testimonial {
  nombre: string;
  cargo: string | null;
  empresa: string | null;
  provincia: string | null;
  texto: string;
  logo_url: string | null;
}
export interface Metric {
  clave: string;
  etiqueta: string;
  valor: number | null;
  sufijo?: string;
}
interface Page<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

const BASE = (process.env.API_INTERNAL_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const OFFLINE = process.env.SEI_OFFLINE_BUILD === '1';

async function get<T>(path: string, fallback: T): Promise<T> {
  if (OFFLINE) return fallback;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error(
      `No se pudo conectar con la API en ${BASE} (${String(err)}). ` +
        'Levantala (make dev-local) o usá SEI_OFFLINE_BUILD=1 para compilar sin datos.',
      { cause: err },
    );
  }
  if (!res.ok) throw new Error(`GET /api${path} respondió ${res.status}`);
  return (await res.json()) as T;
}

async function getAll<T>(path: string): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const res = await get<Page<T>>(`${path}${sep}page=${page}&per_page=50`, {
      items: [],
      total: 0,
      page,
      per_page: 50,
    });
    items.push(...res.items);
    if (items.length >= res.total || res.items.length === 0) return items;
  }
}

// Memoize per build: many pages ask for the same data.
const cache = new Map<string, Promise<unknown>>();
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key) as Promise<T>;
}

export const getProjects = () => once('projects', () => getAll<ProjectSummary>('/projects'));
export const getProject = (slug: string) =>
  once(`project:${slug}`, () => get<ProjectDetail | null>(`/projects/${encodeURIComponent(slug)}`, null));
export const getArticles = () => once('articles', () => getAll<ArticleSummary>('/articles'));
export const getArticle = (slug: string) =>
  once(`article:${slug}`, () => get<ArticleDetail | null>(`/articles/${encodeURIComponent(slug)}`, null));
export const getTestimonials = () => once('testimonials', () => get<Testimonial[]>('/testimonials', []));

interface PublicSettings {
  values: {
    contacto?: Partial<Pick<SiteConfig, 'address' | 'phone' | 'mobile' | 'email'>> & {
      direccion?: string;
      telefono?: string;
      celular?: string;
    };
    whatsapp?: { numero?: string };
    metricas?: Metric[];
    tg_phi_limite?: number;
  };
}

export interface SiteData {
  site: SiteConfig;
  metrics: Metric[];
  tgPhiLimit: number;
}

/** Contact data and settings from `site_settings`, falling back to the defaults in site.ts. */
export const getSiteData = () =>
  once('settings', async (): Promise<SiteData> => {
    const { values } = await get<PublicSettings>('/settings/public', { values: {} });
    const c = values.contacto ?? {};
    return {
      site: {
        ...defaultSite,
        address: c.direccion ?? defaultSite.address,
        phone: c.telefono ?? defaultSite.phone,
        mobile: c.celular ?? defaultSite.mobile,
        email: c.email ?? defaultSite.email,
        whatsapp: values.whatsapp?.numero ?? defaultSite.whatsapp,
      },
      metrics: values.metricas ?? [],
      tgPhiLimit: values.tg_phi_limite ?? 0.62,
    };
  });
