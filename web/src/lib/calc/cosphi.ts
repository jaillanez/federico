/**
 * Power factor from a billing period (orientative). Pure functions, no imports, unit-tested.
 *
 *   tg φ  = kVArh / kWh
 *   cos φ = 1 / √(1 + tg² φ)
 */
export const DEFAULT_TG_PHI_LIMITE = 0.62; // TODO(federico): confirm per distributor.

export interface CosPhiResult {
  tgPhi: number;
  cosPhi: number;
  limite: number;
  /** cos φ equivalent to the tg φ limit. */
  cosPhiLimite: number;
  /** True when tg φ exceeds the limit: a surcharge is likely. */
  probableRecargo: boolean;
}

export function cosPhiFromTg(tg: number): number {
  return 1 / Math.sqrt(1 + tg * tg);
}

export function validarCosPhi(kwh: number, kvarh: number): string | null {
  if (!Number.isFinite(kwh) || !Number.isFinite(kvarh)) return 'Completá ambos valores con números.';
  if (kwh <= 0) return 'La energía activa tiene que ser mayor a cero.';
  if (kvarh < 0) return 'La energía reactiva no puede ser negativa.';
  return null;
}

export function calcularCosPhi(kwh: number, kvarh: number, limite = DEFAULT_TG_PHI_LIMITE): CosPhiResult {
  const error = validarCosPhi(kwh, kvarh);
  if (error) throw new RangeError(error);
  const tgPhi = kvarh / kwh;
  return {
    tgPhi,
    cosPhi: cosPhiFromTg(tgPhi),
    limite,
    cosPhiLimite: cosPhiFromTg(limite),
    probableRecargo: tgPhi > limite,
  };
}
