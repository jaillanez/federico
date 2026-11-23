/** schema.org JSON-LD builders. */
import type { SiteConfig } from './site';
import { FOCUS_PROVINCES } from './site';

type Json = Record<string, unknown>;

const abs = (path: string, site: URL) => new URL(path, site).href;

export function professionalService(s: SiteConfig, site: URL): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': abs('/#empresa', site),
    name: s.legalName,
    url: abs('/', site),
    logo: abs('/favicon.svg', site),
    image: abs('/og/inicio.png', site),
    email: s.email,
    telephone: s.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.address.replace(/, San Juan$/, ''),
      addressLocality: 'San Juan',
      addressRegion: 'San Juan',
      addressCountry: 'AR',
    },
    areaServed: [
      { '@type': 'Country', name: 'Argentina' },
      ...FOCUS_PROVINCES.map((name) => ({ '@type': 'State', name })),
    ],
    founder: { '@id': abs('/sobre-federico#federico', site) },
    knowsAbout: [
      'Obras eléctricas de media y baja tensión',
      'Tableros industriales y de bombeo',
      'Corrección del factor de potencia',
      'Asesoramiento tarifario',
      'Consultoría solar',
    ],
  };
}

export function person(site: URL): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': abs('/sobre-federico#federico', site),
    name: 'Federico Delgado',
    honorificPrefix: 'Ing.',
    jobTitle: 'Ingeniero eléctrico y consultor energético',
    url: abs('/sobre-federico', site),
    worksFor: { '@id': abs('/#empresa', site) },
  };
}

export function faqPage(items: { pregunta: string; respuesta: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: f.respuesta },
    })),
  };
}

export function breadcrumbs(items: { name: string; path: string }[], site: URL): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.path, site),
    })),
  };
}

export function article(
  a: { titulo: string; extracto: string | null; publicado_at: string; updated_at: string; slug: string },
  image: string,
  site: URL,
): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.titulo,
    description: a.extracto ?? undefined,
    datePublished: a.publicado_at,
    dateModified: a.updated_at,
    image: [abs(image, site)],
    mainEntityOfPage: abs(`/articulos/${a.slug}`, site),
    author: { '@type': 'Person', name: 'Ing. Federico Delgado', url: abs('/sobre-federico', site) },
    publisher: { '@id': abs('/#empresa', site) },
  };
}
