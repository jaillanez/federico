/** Solar payback simulator (orientative). Formulas live in lib/calc/repago.ts (unit-tested). */
import { useRef, useState } from 'preact/hooks';
import {
  DEFAULT_DEGRADACION,
  DEFAULT_HORIZONTE,
  simularRepago,
  validarRepago,
  type RepagoResult,
} from '@/lib/calc/repago';
import { formatNumber, formatUsd } from '@/lib/format';
import { track } from '@/lib/analytics';
import { controlClass } from '@/components/ui/control';

type Field = 'inversion' | 'ahorroAnual' | 'mantenimientoPct' | 'degradacionPct';

const FIELDS: { key: Field; label: string; hint: string; unit: string; step: string }[] = [
  {
    key: 'inversion',
    label: 'Inversión total',
    hint: 'Precio final del proyecto, con instalación.',
    unit: 'USD',
    step: '1000',
  },
  {
    key: 'ahorroAnual',
    label: 'Ahorro del primer año',
    hint: 'Lo que dejarías de pagar de energía en un año.',
    unit: 'USD',
    step: '500',
  },
  {
    key: 'mantenimientoPct',
    label: 'Mantenimiento anual',
    hint: 'Como porcentaje de la inversión.',
    unit: '%',
    step: '0.1',
  },
  {
    key: 'degradacionPct',
    label: 'Degradación anual de los paneles',
    hint: 'Pérdida de rendimiento por año.',
    unit: '%',
    step: '0.1',
  },
];

// Example values so the chart is visible on load; the user replaces them with their own.
const EXAMPLE: Record<Field, string> = {
  inversion: '100000',
  ahorroAnual: '18000',
  mantenimientoPct: '1',
  degradacionPct: String(DEFAULT_DEGRADACION),
};

export default function SimuladorRepago() {
  const [values, setValues] = useState(EXAMPLE);
  const tracked = useRef(false);

  const input = {
    inversion: Number(values.inversion),
    ahorroAnual: Number(values.ahorroAnual),
    mantenimientoPct: Number(values.mantenimientoPct),
    degradacionPct: Number(values.degradacionPct),
  };
  const anyEmpty = Object.values(values).some((v) => v.trim() === '');
  const error = anyEmpty ? 'Completá todos los valores.' : validarRepago(input);
  // 25 iterations: cheap enough to recompute on every render.
  const result = error ? null : simularRepago(input);

  const onInput = (key: Field, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (!tracked.current) {
      tracked.current = true;
      track('simulador_usado', { simulador: 'repago' });
    }
  };

  return (
    <div class="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form class="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()} aria-describedby="sim-ejemplo">
        <p id="sim-ejemplo" class="text-sm text-ink-muted">
          Cargamos valores de ejemplo: reemplazalos por los de tu presupuesto.
        </p>
        {FIELDS.map((f) => (
          <div key={f.key} class="flex flex-col gap-1.5">
            <label for={`sim-${f.key}`} class="text-sm font-medium">
              {f.label} <span class="font-normal text-ink-muted">({f.unit})</span>
            </label>
            <input
              id={`sim-${f.key}`}
              type="number"
              inputMode="decimal"
              min="0"
              step={f.step}
              value={values[f.key]}
              onInput={(e) => onInput(f.key, e.currentTarget.value)}
              aria-describedby={`sim-${f.key}-hint`}
              class={controlClass}
            />
            <p id={`sim-${f.key}-hint`} class="text-sm text-ink-muted">
              {f.hint}
            </p>
          </div>
        ))}
        <p class="text-sm text-ink-muted">Horizonte de análisis: {DEFAULT_HORIZONTE} años.</p>
      </form>

      <div aria-live="polite">
        {error || !result ? (
          <p class="rounded-card border border-dashed border-line p-6 text-ink-muted">{error}</p>
        ) : (
          <Result result={result} inversion={input.inversion} />
        )}
      </div>
    </div>
  );
}

function Result({ result, inversion }: { result: RepagoResult; inversion: number }) {
  const { anioRepago, repagoExacto, saldoFinal } = result;
  return (
    <div class="flex flex-col gap-5">
      <dl class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-card border border-line bg-white p-4">
          <dt class="text-sm text-ink-muted">Repago estimado</dt>
          <dd class="mt-1 font-display text-h2 font-bold tracking-tight">
            {anioRepago ? `Año ${anioRepago}` : 'Sin repago'}
          </dd>
          <dd class="text-sm text-ink-muted">
            {repagoExacto ? `≈ ${formatNumber(repagoExacto, 1)} años` : `No se recupera en ${DEFAULT_HORIZONTE} años`}
          </dd>
        </div>
        <div class="rounded-card border border-line bg-white p-4">
          <dt class="text-sm text-ink-muted">Saldo a {DEFAULT_HORIZONTE} años</dt>
          <dd class={`mt-1 font-display text-h2 font-bold tracking-tight ${saldoFinal < 0 ? 'text-danger' : ''}`}>
            {formatUsd(saldoFinal)}
          </dd>
          <dd class="text-sm text-ink-muted">sobre una inversión de {formatUsd(inversion)}</dd>
        </div>
      </dl>
      <Chart result={result} />
    </div>
  );
}

const W = 640;
const H = 280;
const PAD = { top: 16, right: 12, bottom: 32, left: 64 };

function Chart({ result }: { result: RepagoResult }) {
  const { years, anioRepago } = result;
  const values = years.map((y) => y.acumulado);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((max - v) / span) * innerH;
  const band = innerW / years.length;
  const ticks = [min, min / 2, 0, max / 2, max].filter((v, i, a) => a.indexOf(v) === i);
  const summary = anioRepago
    ? `Flujo acumulado: negativo hasta el año ${anioRepago - 1} y positivo desde el año ${anioRepago}.`
    : 'Flujo acumulado: se mantiene negativo durante todo el horizonte.';

  return (
    <figure>
      <figcaption class="mb-2 text-sm font-medium">Flujo de fondos acumulado (USD)</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        class="w-full rounded-card border border-line bg-white"
        role="img"
        aria-label={summary}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              class={t === 0 ? 'stroke-ink' : 'stroke-line'}
              stroke-width={t === 0 ? 1.5 : 1}
            />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" text-anchor="end" class="fill-ink-muted text-[11px]">
              {compactUsd(t)}
            </text>
          </g>
        ))}
        {years.map((yr, i) => {
          const top = y(Math.max(0, yr.acumulado));
          const h = Math.max(1, Math.abs(y(yr.acumulado) - y(0)));
          return (
            <rect
              key={yr.anio}
              x={PAD.left + i * band + band * 0.15}
              y={top}
              width={band * 0.7}
              height={h}
              rx="1.5"
              class={yr.acumulado >= 0 ? 'fill-accent' : 'fill-primary-300'}
            >
              <title>{`Año ${yr.anio}: ${formatUsd(yr.acumulado)}`}</title>
            </rect>
          );
        })}
        {years
          .filter((yr) => yr.anio === 1 || yr.anio % 5 === 0)
          .map((yr) => (
            <text
              key={yr.anio}
              x={PAD.left + (yr.anio - 0.5) * band}
              y={H - 10}
              text-anchor="middle"
              class="fill-ink-muted text-[11px]"
            >
              {yr.anio}
            </text>
          ))}
      </svg>
      <details class="mt-3 text-sm">
        <summary class="cursor-pointer font-medium text-primary-700">Ver la tabla año por año</summary>
        <div class="mt-2 max-h-72 overflow-auto rounded-md border border-line">
          <table class="w-full text-right tabular-nums">
            <thead class="sticky top-0 bg-surface text-ink-muted">
              <tr>
                <th scope="col" class="p-2 text-left">
                  Año
                </th>
                <th scope="col" class="p-2">
                  Ahorro
                </th>
                <th scope="col" class="p-2">
                  Mantenimiento
                </th>
                <th scope="col" class="p-2">
                  Acumulado
                </th>
              </tr>
            </thead>
            <tbody>
              {years.map((yr) => (
                <tr key={yr.anio} class="border-t border-line">
                  <th scope="row" class="p-2 text-left font-normal">
                    {yr.anio}
                  </th>
                  <td class="p-2">{formatUsd(yr.ahorro)}</td>
                  <td class="p-2">{formatUsd(yr.mantenimiento)}</td>
                  <td class={`p-2 ${yr.acumulado < 0 ? 'text-danger' : ''}`}>{formatUsd(yr.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function compactUsd(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const s = abs >= 1_000_000 ? `${formatNumber(abs / 1_000_000, 1)} M` : `${formatNumber(abs / 1000)} k`;
  return `${v < 0 ? '−' : ''}${s}`;
}
