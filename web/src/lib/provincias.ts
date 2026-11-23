/** The 24 Argentine jurisdictions; focus provinces first (form dropdowns). */
export const PROVINCIAS_FOCO = ['San Juan', 'Mendoza', 'La Rioja', 'Catamarca'] as const;

export const PROVINCIAS_RESTO = [
  'Buenos Aires',
  'Ciudad Autónoma de Buenos Aires',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
] as const;

export const PROVINCIAS = [...PROVINCIAS_FOCO, ...PROVINCIAS_RESTO];
