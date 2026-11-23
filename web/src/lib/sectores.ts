/** Industries served (marketing copy). Slugs match the `sectors` table seed. */
export const SECTORES = [
  {
    slug: 'agroindustria',
    nombre: 'Agroindustria',
    texto: 'Bodegas, secaderos y plantas de procesamiento con alta demanda en temporada.',
  },
  {
    slug: 'mineria',
    nombre: 'Minería',
    texto: 'Instalaciones de fuerza motriz y distribución en condiciones exigentes.',
  },
  {
    slug: 'plantas-industriales',
    nombre: 'Plantas industriales',
    texto: 'CCM, tableros y gestión de la demanda para procesos continuos.',
  },
  {
    slug: 'fincas-y-riego',
    nombre: 'Fincas y riego',
    texto: 'Tableros de bombeo y optimización tarifaria del riego por pozo.',
  },
  {
    slug: 'envasadoras',
    nombre: 'Envasadoras',
    texto: 'Líneas de envasado con picos de potencia y consumo de energía reactiva.',
  },
] as const;
