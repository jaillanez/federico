/**
 * Open Graph images (1200×630) generated at build time for every page: satori turns the layout
 * into SVG (text as paths) and sharp rasterizes it to PNG.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import sharp from 'sharp';
import { getArticles, getProjects } from '@/lib/api';

type OgData = {
  eyebrow: string;
  title: string;
};

const STATIC: Record<string, OgData> = {
  cobertura: { eyebrow: 'Cobertura nacional', title: 'San Juan, Mendoza, La Rioja, Catamarca y todo el país' },
  articulos: { eyebrow: 'Artículos', title: 'Ingeniería y energía, sin letra chica' },
  diagnostico: { eyebrow: 'Diagnóstico Exprés', title: 'Auditá tu factura eléctrica o evaluá tu presupuesto solar' },
};

export const getStaticPaths: GetStaticPaths = async () => {
  const [pages, projects, articles] = await Promise.all([getCollection('paginas'), getProjects(), getArticles()]);
  const props: { slug: string; data: OgData }[] = [
    ...pages.map((p) => ({ slug: p.id, data: { eyebrow: p.data.eyebrow ?? 'S.E.I.', title: p.data.h1 } })),
    ...Object.entries(STATIC).map(([slug, data]) => ({ slug, data })),
    ...projects.map((p) => ({
      slug: `obras/${p.slug}`,
      data: {
        eyebrow: [p.categoria?.nombre, p.provincia].filter(Boolean).join(' · ') || 'Obra eléctrica',
        title: p.titulo,
      },
    })),
    ...articles.map((a) => ({ slug: `articulos/${a.slug}`, data: { eyebrow: 'Artículo técnico', title: a.titulo } })),
  ];
  return props.map(({ slug, data }) => ({ params: { slug }, props: data }));
};

const fontDir = join(process.cwd(), 'node_modules/@fontsource');
let fonts: Promise<Parameters<typeof satori>[1]['fonts']> | undefined;
const loadFonts = () =>
  (fonts ??= Promise.all([
    readFile(join(fontDir, 'archivo/files/archivo-latin-800-normal.woff')),
    readFile(join(fontDir, 'inter/files/inter-latin-500-normal.woff')),
  ]).then(([archivo, inter]) => [
    { name: 'Archivo', data: archivo, weight: 800 as const, style: 'normal' as const },
    { name: 'Inter', data: inter, weight: 500 as const, style: 'normal' as const },
  ]));

// Minimal element helper (satori accepts React-like objects).
type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, children },
});

const grid =
  'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)';

export const GET: APIRoute = async ({ props }) => {
  const { eyebrow, title } = props as OgData;
  const size = title.length > 70 ? 52 : title.length > 45 ? 60 : 72;
  const tree = h(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      padding: '64px 72px',
      backgroundColor: '#051d47',
      backgroundImage: grid,
      backgroundSize: '96px 96px',
      color: 'white',
      fontFamily: 'Inter',
      borderBottom: '14px solid #f59e0b',
    },
    [
      h('div', { display: 'flex', alignItems: 'center', gap: 20 }, [
        h(
          'div',
          {
            width: 64,
            height: 64,
            borderRadius: 12,
            backgroundColor: '#0b3d91',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
          {
            type: 'svg',
            props: {
              width: 38,
              height: 38,
              viewBox: '0 0 24 24',
              fill: '#f59e0b',
              children: { type: 'path', props: { d: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z' } },
            },
          },
        ),
        h('div', { display: 'flex', flexDirection: 'column' }, [
          h('div', { fontFamily: 'Archivo', fontSize: 34, letterSpacing: -1 }, 'S.E.I.'),
          h('div', { fontSize: 22, color: '#adc4ea' }, 'Ing. Federico Delgado'),
        ]),
      ]),
      h('div', { display: 'flex', flexDirection: 'column', width: 1056, marginTop: 110 }, [
        h(
          'div',
          { fontSize: 26, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 20 },
          eyebrow,
        ),
        h(
          'div',
          { display: 'flex', width: 1000, fontFamily: 'Archivo', fontSize: size, lineHeight: 1.1, letterSpacing: -1 },
          title,
        ),
      ]),
    ],
  );
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: await loadFonts(),
  });
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
