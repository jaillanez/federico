import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simularRepago, validarRepago } from './repago.ts';
import { calcularCosPhi, cosPhiFromTg, validarCosPhi } from './cosphi.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('repago: no degradation, no maintenance → investment / savings', () => {
  const r = simularRepago({ inversion: 100_000, ahorroAnual: 25_000, mantenimientoPct: 0, degradacionPct: 0 });
  assert.equal(r.anioRepago, 4);
  close(r.repagoExacto ?? NaN, 4);
  assert.equal(r.years.length, 25);
  close(r.saldoFinal, -100_000 + 25 * 25_000);
});

test('repago: fractional payback is interpolated inside the year', () => {
  const r = simularRepago({ inversion: 100_000, ahorroAnual: 30_000, mantenimientoPct: 0, degradacionPct: 0 });
  assert.equal(r.anioRepago, 4);
  close(r.repagoExacto ?? NaN, 100_000 / 30_000);
});

test('repago: degradation compounds and maintenance is % of investment', () => {
  const r = simularRepago({ inversion: 1000, ahorroAnual: 200, mantenimientoPct: 1, degradacionPct: 10 });
  close(r.years[0]!.ahorro, 200);
  close(r.years[1]!.ahorro, 180);
  close(r.years[2]!.ahorro, 162);
  close(r.years[0]!.mantenimiento, 10);
  close(r.years[0]!.acumulado, -1000 + 190);
  close(r.years[1]!.acumulado, -1000 + 190 + 170);
});

test('repago: default degradation is 0.5 % and horizon 25 years', () => {
  const r = simularRepago({ inversion: 1000, ahorroAnual: 100, mantenimientoPct: 0 });
  close(r.years[1]!.ahorro, 99.5);
  assert.equal(r.years.at(-1)!.anio, 25);
});

test('repago: never pays back → null', () => {
  const r = simularRepago({ inversion: 100_000, ahorroAnual: 3_000, mantenimientoPct: 1, degradacionPct: 0.5 });
  assert.equal(r.anioRepago, null);
  assert.equal(r.repagoExacto, null);
  assert.ok(r.saldoFinal < 0);
});

test('repago: maintenance larger than savings never pays back', () => {
  const r = simularRepago({ inversion: 1000, ahorroAnual: 50, mantenimientoPct: 10, degradacionPct: 0 });
  assert.equal(r.anioRepago, null);
});

test('repago: validation', () => {
  assert.match(validarRepago({ inversion: 0, ahorroAnual: 1, mantenimientoPct: 0 }) ?? '', /inversión/);
  assert.match(validarRepago({ inversion: 1, ahorroAnual: 0, mantenimientoPct: 0 }) ?? '', /ahorro/);
  assert.match(validarRepago({ inversion: 1, ahorroAnual: 1, mantenimientoPct: -1 }) ?? '', /mantenimiento/);
  assert.match(validarRepago({ inversion: NaN, ahorroAnual: 1, mantenimientoPct: 0 }) ?? '', /números/);
  assert.throws(() => simularRepago({ inversion: -1, ahorroAnual: 1, mantenimientoPct: 0 }), RangeError);
});

test('cos φ: textbook values', () => {
  close(cosPhiFromTg(0), 1);
  close(cosPhiFromTg(1), Math.SQRT1_2);
  close(cosPhiFromTg(0.75), 0.8);
});

test('cos φ: tg φ = kVArh / kWh and surcharge above the limit', () => {
  const ok = calcularCosPhi(10_000, 5_000);
  close(ok.tgPhi, 0.5);
  close(ok.cosPhi, 1 / Math.sqrt(1.25));
  assert.equal(ok.probableRecargo, false);

  const bad = calcularCosPhi(10_000, 7_500);
  close(bad.cosPhi, 0.8);
  assert.equal(bad.probableRecargo, true);
});

test('cos φ: exactly at the limit is not a surcharge; limit is configurable', () => {
  assert.equal(calcularCosPhi(100, 62).probableRecargo, false);
  assert.equal(calcularCosPhi(100, 62, 0.5).probableRecargo, true);
  close(calcularCosPhi(100, 62).cosPhiLimite, 1 / Math.sqrt(1 + 0.62 ** 2));
});

test('cos φ: validation', () => {
  assert.match(validarCosPhi(0, 1) ?? '', /activa/);
  assert.match(validarCosPhi(1, -1) ?? '', /reactiva/);
  assert.equal(validarCosPhi(1, 0), null);
  assert.throws(() => calcularCosPhi(0, 1), RangeError);
});
