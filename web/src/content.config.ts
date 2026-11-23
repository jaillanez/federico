import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const card = z.object({ titulo: z.string(), texto: z.string(), icono: z.string().optional() });
const faq = z.object({ pregunta: z.string(), respuesta: z.string() });

/**
 * Long-form copy of the public pages. Each file = one page; the page template decides layout.
 * TODO(federico): every technical text is a draft and must be reviewed by Federico.
 */
const paginas = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/paginas' }),
  schema: z.object({
    seoTitle: z.string().max(28, 'Con el sufijo " | S.E.I. Ing. Federico Delgado" no puede superar 60'),
    seoDescription: z.string().min(70).max(155),
    eyebrow: z.string().optional(),
    h1: z.string(),
    bajada: z.string(),
    tarjetas: z.array(card).default([]),
    tarjetasTitulo: z.string().optional(),
    comparativa: z
      .object({
        titulo: z.string(),
        izquierda: z.object({ titulo: z.string(), items: z.array(z.string()) }),
        derecha: z.object({ titulo: z.string(), items: z.array(z.string()) }),
      })
      .optional(),
    pilares: z.array(card).default([]),
    pilaresTitulo: z.string().optional(),
    pasos: z.array(card).default([]),
    pasosTitulo: z.string().optional(),
    servicios: z.array(card).default([]),
    serviciosTitulo: z.string().optional(),
    valores: z.array(card).default([]),
    trayectoria: z.array(z.object({ periodo: z.string(), titulo: z.string(), texto: z.string() })).default([]),
    faq: z.array(faq).default([]),
  }),
});

export const collections = { paginas };
