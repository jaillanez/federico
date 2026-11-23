/** Power factor calculator (orientative). Formulas live in lib/calc/cosphi.ts (unit-tested). */
import { useRef, useState } from 'preact/hooks';
import { calcularCosPhi, validarCosPhi } from '@/lib/calc/cosphi';
import { formatNumber } from '@/lib/format';
import { track } from '@/lib/analytics';
import { controlClass } from '@/components/ui/control';

interface Props {
  /** tg φ limit from site settings (default 0.62). */
  limite: number;
}

export default function CalculadoraCosPhi({ limite }: Props) {
  const [kwh, setKwh] = useState('');
  const [kvarh, setKvarh] = useState('');
  const tracked = useRef(false);

  const empty = kwh.trim() === '' || kvarh.trim() === '';
  const error = empty ? null : validarCosPhi(Number(kwh), Number(kvarh));
  const result = empty || error ? null : calcularCosPhi(Number(kwh), Number(kvarh), limite);

  const onInput = (set: (v: string) => void, value: string) => {
    set(value);
    if (!tracked.current) {
      tracked.current = true;
      track('simulador_usado', { simulador: 'cos_phi' });
    }
  };

  // Gauge: position of tg φ on a 0 … 2×limit scale.
  const scaleMax = limite * 2;
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  return (
    <div class="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form class="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
        <p class="text-sm text-ink-muted">Copiá los valores de tu última factura, del mismo período.</p>
        <div class="flex flex-col gap-1.5">
          <label for="cp-kwh" class="text-sm font-medium">
            Energía activa <span class="font-normal text-ink-muted">(kWh)</span>
          </label>
          <input
            id="cp-kwh"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={kwh}
            class={controlClass}
            onInput={(e) => onInput(setKwh, e.currentTarget.value)}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="cp-kvarh" class="text-sm font-medium">
            Energía reactiva <span class="font-normal text-ink-muted">(kVArh)</span>
          </label>
          <input
            id="cp-kvarh"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={kvarh}
            class={controlClass}
            onInput={(e) => onInput(setKvarh, e.currentTarget.value)}
          />
        </div>
      </form>

      <div aria-live="polite" class="flex flex-col gap-4">
        {!result ? (
          <p class="rounded-card border border-dashed border-line p-6 text-ink-muted">
            {error ?? 'Ingresá la energía activa y la reactiva para calcular tu factor de potencia.'}
          </p>
        ) : (
          <>
            <dl class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-card border border-line bg-white p-4">
                <dt class="text-sm text-ink-muted">tg φ</dt>
                <dd class="mt-1 font-display text-h2 font-bold tracking-tight tabular-nums">
                  {formatNumber(result.tgPhi, 2)}
                </dd>
                <dd class="text-sm text-ink-muted">límite de referencia: {formatNumber(limite, 2)}</dd>
              </div>
              <div class="rounded-card border border-line bg-white p-4">
                <dt class="text-sm text-ink-muted">cos φ</dt>
                <dd class="mt-1 font-display text-h2 font-bold tracking-tight tabular-nums">
                  {formatNumber(result.cosPhi, 2)}
                </dd>
                <dd class="text-sm text-ink-muted">equivale a un mínimo de {formatNumber(result.cosPhiLimite, 2)}</dd>
              </div>
            </dl>
            <div aria-hidden="true">
              <div
                class="relative h-3 rounded-full bg-surface"
                style={{ '--tg': pct(result.tgPhi), '--lim': pct(limite) }}
              >
                <div class={`h-full w-(--tg) rounded-full ${result.probableRecargo ? 'bg-danger' : 'bg-success'}`} />
                <div class="absolute -inset-y-1 left-(--lim) w-0.5 bg-ink" />
              </div>
              <div class="mt-1 flex justify-between text-xs text-ink-muted">
                <span>0</span>
                <span>límite</span>
                <span>{formatNumber(scaleMax, 2)}</span>
              </div>
            </div>
            {result.probableRecargo ? (
              <p class="rounded-card border-l-4 border-danger bg-red-50 p-4">
                <strong>Probablemente tengas recargo por energía reactiva.</strong> Tu tg φ supera el límite de
                referencia. Con una compensación bien dimensionada, ese cargo suele eliminarse.
              </p>
            ) : (
              <p class="rounded-card border-l-4 border-success bg-green-50 p-4">
                <strong>Tu factor de potencia está dentro del límite de referencia.</strong> Igual conviene revisar la
                potencia contratada y las bandas horarias.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
