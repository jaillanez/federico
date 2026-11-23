/**
 * Solar payback simulation (orientative). Pure functions, no imports, unit-tested.
 *
 * Year t (1..horizon):
 *   savings_t     = annualSavings × (1 − degradation)^(t−1)
 *   maintenance_t = investment × maintenance%
 *   cumulative_t  = −investment + Σ (savings − maintenance)
 */
export interface RepagoInput {
  /** Investment in USD. */
  inversion: number;
  /** First-year savings in USD. */
  ahorroAnual: number;
  /** Annual maintenance, % of the investment. */
  mantenimientoPct: number;
  /** Annual panel degradation, % (default 0.5). */
  degradacionPct?: number;
  /** Years to simulate (default 25). */
  horizonte?: number;
}

export interface RepagoYear {
  anio: number;
  ahorro: number;
  mantenimiento: number;
  flujoNeto: number;
  acumulado: number;
}

export interface RepagoResult {
  years: RepagoYear[];
  /** First year whose cumulative cash flow is ≥ 0, or null if it never pays back. */
  anioRepago: number | null;
  /** Payback in fractional years (linear interpolation inside the payback year). */
  repagoExacto: number | null;
  /** Cumulative cash flow at the end of the horizon. */
  saldoFinal: number;
}

export const DEFAULT_DEGRADACION = 0.5;
export const DEFAULT_HORIZONTE = 25;

export function validarRepago(input: RepagoInput): string | null {
  const { inversion, ahorroAnual, mantenimientoPct, degradacionPct = DEFAULT_DEGRADACION } = input;
  const nums = [inversion, ahorroAnual, mantenimientoPct, degradacionPct];
  if (nums.some((n) => !Number.isFinite(n))) return 'Completá todos los valores con números.';
  if (inversion <= 0) return 'La inversión tiene que ser mayor a cero.';
  if (ahorroAnual <= 0) return 'El ahorro anual tiene que ser mayor a cero.';
  if (mantenimientoPct < 0 || mantenimientoPct > 100) return 'El mantenimiento va de 0 a 100 %.';
  if (degradacionPct < 0 || degradacionPct > 100) return 'La degradación va de 0 a 100 %.';
  return null;
}

export function simularRepago(input: RepagoInput): RepagoResult {
  const error = validarRepago(input);
  if (error) throw new RangeError(error);
  const horizonte = input.horizonte ?? DEFAULT_HORIZONTE;
  const degradacion = (input.degradacionPct ?? DEFAULT_DEGRADACION) / 100;
  const mantenimiento = (input.inversion * input.mantenimientoPct) / 100;

  const years: RepagoYear[] = [];
  let acumulado = -input.inversion;
  let anioRepago: number | null = null;
  let repagoExacto: number | null = null;

  for (let anio = 1; anio <= horizonte; anio++) {
    const ahorro = input.ahorroAnual * (1 - degradacion) ** (anio - 1);
    const flujoNeto = ahorro - mantenimiento;
    const previo = acumulado;
    acumulado += flujoNeto;
    years.push({ anio, ahorro, mantenimiento, flujoNeto, acumulado });
    if (anioRepago === null && acumulado >= 0 && flujoNeto > 0) {
      anioRepago = anio;
      repagoExacto = anio - 1 + -previo / flujoNeto;
    }
  }
  return { years, anioRepago, repagoExacto, saldoFinal: acumulado };
}
