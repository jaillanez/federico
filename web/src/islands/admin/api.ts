/** Admin API client. Same-origin requests; the session cookie travels automatically. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[];

export async function api<T>(method: string, path: string, body?: Json | FormData): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, 'network', 'Sin conexión. Revisá tu internet y probá de nuevo.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as {
    error?: { code: string; message: string; fields: Record<string, string> };
  } | null;
  if (!res.ok) {
    const e = data?.error;
    if (res.status === 401) window.dispatchEvent(new CustomEvent('sei:unauthorized'));
    throw new ApiError(res.status, e?.code ?? 'http', e?.message ?? 'Ocurrió un error.', e?.fields ?? {});
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: Json | FormData) => api<T>('POST', path, body);
export const patch = <T>(path: string, body: Json) => api<T>('PATCH', path, body);
export const put = <T>(path: string, body: Json) => api<T>('PUT', path, body);
export const del = (path: string): Promise<unknown> => api<unknown>('DELETE', path);

/** Multipart upload with progress (XHR), for photos. */
export function upload<T>(path: string, body: FormData, onProgress?: (f: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as T);
      else {
        const e = (xhr.response as { error?: { code: string; message: string } } | null)?.error;
        reject(new ApiError(xhr.status, e?.code ?? 'http', e?.message ?? 'No se pudo subir.'));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Sin conexión.'));
    xhr.send(body);
  });
}

// --- Types (mirror api/app/schemas/admin.py) ---
export interface User {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'editor';
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}
export interface CatalogItem {
  slug: string;
  nombre: string;
}
export interface ImageSource {
  width: number;
  avif: string;
  webp: string;
}
export interface AdminImage {
  id: string;
  alt_text: string;
  ancho: number | null;
  alto: number | null;
  es_portada: boolean;
  tipo: 'general' | 'antes' | 'despues';
  sources: ImageSource[];
  orden: number;
  procesando: boolean;
}
export interface ProjectSummary {
  id: string;
  slug: string;
  titulo: string;
  provincia: string | null;
  categoria: CatalogItem | null;
  publicado: boolean;
  destacado: boolean;
  cantidad_fotos: number;
  portada: AdminImage | null;
  updated_at: string;
}
export interface Project extends ProjectSummary {
  resumen: string | null;
  problema: string | null;
  solucion: string | null;
  resultado: string | null;
  localidad: string | null;
  lat: number | null;
  lng: number | null;
  sector: CatalogItem | null;
  fecha_obra: string | null;
  potencia_kw: number | null;
  seo_title: string | null;
  seo_description: string | null;
  imagenes: AdminImage[];
}
export type Estado = 'nuevo' | 'en_analisis' | 'respondido' | 'cliente' | 'descartado';
export interface LeadSummary {
  id: string;
  created_at: string;
  empresa: string | null;
  contacto_nombre: string;
  email: string;
  whatsapp: string | null;
  provincia: string | null;
  origen: string;
  estado: Estado;
  objetivos: string[];
  cantidad_archivos: number;
}
export interface LeadDetail extends LeadSummary {
  cargo: string | null;
  localidad: string | null;
  mensaje: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  consentimiento_at: string | null;
  archivos: { id: string; tipo: string; nombre_original: string; mime: string; bytes: number }[];
  notas: {
    id: string;
    created_at: string;
    autor: string | null;
    texto: string | null;
    estado_anterior: string | null;
    estado_nuevo: string | null;
  }[];
}
export interface Article {
  id: string;
  slug: string;
  titulo: string;
  extracto: string | null;
  cuerpo_md: string;
  tags: string[];
  publicado_at: string | null;
  estado: 'borrador' | 'programado' | 'publicado';
  portada_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
}
export interface Testimonial {
  id: string;
  nombre: string;
  cargo: string | null;
  empresa: string | null;
  provincia: string | null;
  texto: string;
  publicado: boolean;
  orden: number;
  logo_url: string | null;
}
export interface Metric {
  clave: string;
  etiqueta: string;
  valor: number | null;
  sufijo: string | null;
}
export interface Settings {
  contacto: { direccion: string; telefono: string; celular: string; email: string };
  whatsapp: { numero: string };
  metricas: Metric[];
  tg_phi_limite: number;
}
export interface RebuildStatus {
  pending: boolean;
  scheduled_for: string | null;
  last_run_at: string | null;
  last_ok: boolean | null;
  configured: boolean;
}
export interface Dashboard {
  consultas_nuevas: number;
  consultas_semana: number;
  semana_por_provincia: Record<string, number>;
  ultimas_obras: ProjectSummary[];
}

export const ESTADOS: { value: Estado; label: string; tone: string }[] = [
  { value: 'nuevo', label: 'Nueva', tone: 'bg-accent-soft text-ink ring-accent/40' },
  { value: 'en_analisis', label: 'En análisis', tone: 'bg-primary-50 text-primary-700 ring-primary-200' },
  { value: 'respondido', label: 'Respondida', tone: 'bg-surface text-ink-muted ring-line' },
  { value: 'cliente', label: 'Cliente', tone: 'bg-green-50 text-success ring-green-200' },
  { value: 'descartado', label: 'Descartada', tone: 'bg-red-50 text-danger ring-red-200' },
];
export const GOAL_LABELS: Record<string, string> = {
  reducir_costo_fijo: 'Reducir costos fijos',
  eliminar_penalizaciones: 'Eliminar penalizaciones',
  evaluar_solar: 'Evaluar paneles solares',
  revisar_categoria: 'Revisar categoría tarifaria',
};
