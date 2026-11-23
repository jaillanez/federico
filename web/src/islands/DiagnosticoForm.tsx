/**
 * Diagnóstico Exprés: 3-step form (data → files → goal). Everything typed stays in state when
 * going back; text fields also survive a reload (sessionStorage), files cannot.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { PROVINCIAS_FOCO, PROVINCIAS_RESTO } from '@/lib/provincias';
import { looksLikeEmail, normalizeArPhone } from '@/lib/phone';
import { MAX_FILES, MAX_TOTAL_BYTES } from '@/lib/files';
import { readUtm } from '@/lib/utm';
import { createTurnstile, type TurnstileHandle } from '@/lib/turnstile';
import { postForm } from '@/lib/upload';
import { track } from '@/lib/analytics';
import { CheckCard, SelectField, TextField } from './forms/fields';
import FileDrop from './forms/FileDrop';

interface Props {
  turnstileSiteKey: string;
  whatsappUrl: string;
}

const GOALS = [
  { value: 'reducir_costo_fijo', label: 'Reducir costos fijos' },
  { value: 'eliminar_penalizaciones', label: 'Eliminar penalizaciones por potencia o reactiva' },
  { value: 'evaluar_solar', label: 'Evaluar si conviene instalar paneles y su repago real' },
  { value: 'revisar_categoria', label: 'Revisar la categoría tarifaria' },
] as const;

const STEPS = ['Tus datos', 'Archivos', 'Objetivo'] as const;

interface Data {
  empresa: string;
  contacto_nombre: string;
  cargo: string;
  provincia: string;
  localidad: string;
  email: string;
  whatsapp: string;
  objetivos: string[];
  mensaje: string;
  consentimiento: boolean;
}
const EMPTY: Data = {
  empresa: '',
  contacto_nombre: '',
  cargo: '',
  provincia: '',
  localidad: '',
  email: '',
  whatsapp: '',
  objetivos: [],
  mensaje: '',
  consentimiento: false,
};
type Errors = Partial<Record<string, string>>;

// Which step holds each field (to jump back when the API reports an error).
const FIELD_STEP: Record<string, number> = {
  empresa: 0,
  contacto_nombre: 0,
  cargo: 0,
  provincia: 0,
  localidad: 0,
  email: 0,
  whatsapp: 0,
  factura: 1,
  presupuesto_solar: 1,
  archivos: 1,
  objetivos: 2,
  mensaje: 2,
  consentimiento: 2,
};
const DRAFT_KEY = 'sei:diagnostico';

function validate(step: number, d: Data, factura: File[], presupuesto: File[]): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (!d.contacto_nombre.trim()) e.contacto_nombre = 'Ingresá tu nombre.';
    if (!d.provincia) e.provincia = 'Elegí tu provincia.';
    if (!looksLikeEmail(d.email)) e.email = 'Ingresá un email válido, por ejemplo nombre@empresa.com.';
    if (!normalizeArPhone(d.whatsapp)) e.whatsapp = 'Ingresá un celular con código de área, por ejemplo 264 555-1234.';
  }
  if (step === 1) {
    if (factura.length === 0) e.factura = 'Adjuntá tu última factura de energía eléctrica.';
    const all = [...factura, ...presupuesto];
    if (all.length > MAX_FILES) e.archivos = `Podés adjuntar hasta ${MAX_FILES} archivos en total.`;
    if (all.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES)
      e.archivos = 'Entre todos los archivos superan los 40 MB.';
  }
  if (step === 2) {
    if (d.objetivos.length === 0) e.objetivos = 'Elegí al menos un objetivo.';
    if (!d.consentimiento) e.consentimiento = 'Tenés que aceptar la garantía de confidencialidad para enviar.';
  }
  return e;
}

export default function DiagnosticoForm({ turnstileSiteKey, whatsappUrl }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Data>(EMPTY);
  const [factura, setFactura] = useState<File[]>([]);
  const [presupuesto, setPresupuesto] = useState<File[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const captchaEl = useRef<HTMLDivElement>(null);
  // Promise, not value: a fast submit must wait for the script instead of failing.
  const captcha = useRef<Promise<TurnstileHandle> | null>(null);
  const firstRender = useRef(true);

  // Restore / save text fields for this tab (never files or consent).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) setData({ ...EMPTY, ...(JSON.parse(saved) as Partial<Data>), consentimiento: false });
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      // Consent is never restored: it must be given again on each visit.
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, consentimiento: false }));
    } catch {
      /* storage unavailable */
    }
  }, [data]);

  // Move focus to the step title when the step changes (screen readers announce it).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepHeading.current?.focus();
  }, [step, done]);

  // The invisible captcha loads with the page; its container stays mounted across steps.
  useEffect(() => {
    if (!captchaEl.current) return;
    const ready = createTurnstile(captchaEl.current, turnstileSiteKey);
    ready.catch(() => setFormError('No pudimos cargar la verificación anti-spam. Revisá tu conexión o usá WhatsApp.'));
    captcha.current = ready;
    return () => void ready.then((h) => h.destroy()).catch(() => undefined);
  }, [turnstileSiteKey]);

  const set = <K extends keyof Data>(key: K, value: Data[K]) => {
    setData((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const focusFirstError = (errs: Errors) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el =
        document.getElementById(first) ??
        document.querySelector<HTMLElement>(`[data-field="${first}"] button, [data-field="${first}"] input`);
      el?.focus();
    });
  };

  const next = () => {
    const errs = validate(step, data, factura, presupuesto);
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstError(errs);
    setStep((s) => s + 1);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (step < 2) return next();
    // Honeypot: if a bot filled the hidden field, send it so the API discards the lead.
    const trap = (e.currentTarget as HTMLFormElement | null)?.querySelector<HTMLInputElement>('[name="sitio_web"]');

    const errs = validate(2, data, factura, presupuesto);
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstError(errs);
    setFormError(null);

    let token: string;
    try {
      if (!captcha.current) throw new Error('captcha');
      setProgress(0);
      token = await (await captcha.current).getToken();
    } catch {
      setProgress(null);
      setFormError('No pudimos verificar que seas una persona. Probá de nuevo o enviá tu factura por WhatsApp.');
      return;
    }

    const body = new FormData();
    body.set('origen', 'diagnostico');
    for (const [k, v] of Object.entries(data)) {
      if (k === 'objetivos') (v as string[]).forEach((g) => body.append('objetivos', g));
      else if (k === 'consentimiento') body.set(k, v ? 'true' : 'false');
      else if (typeof v === 'string' && v.trim()) body.set(k, v.trim());
    }
    factura.forEach((f) => body.append('factura', f, f.name));
    presupuesto.forEach((f) => body.append('presupuesto_solar', f, f.name));
    for (const [k, v] of Object.entries(readUtm())) if (v) body.set(k, v);
    body.set('cf-turnstile-response', token);
    if (trap?.value) body.set('sitio_web', trap.value);

    const res = await postForm('/api/leads', body, setProgress);
    setProgress(null);
    if (res.ok) {
      track('lead_enviado', { origen: 'diagnostico' });
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setDone(true);
      return;
    }
    const fields = res.error.fields;
    if (Object.keys(fields).length) {
      setErrors(fields);
      const target = Math.min(...Object.keys(fields).map((f) => FIELD_STEP[f] ?? 2));
      setStep(target);
    }
    setFormError(
      res.status === 429
        ? 'Recibimos varios envíos desde tu conexión en la última hora. Probá más tarde o escribinos por WhatsApp.'
        : res.error.message,
    );
  };

  if (done) {
    return (
      <div class="rounded-card border border-green-200 bg-green-50 p-6 sm:p-10" role="status">
        <svg
          viewBox="0 0 24 24"
          class="size-12 text-success"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m7 12 3.5 3.5L17 9" />
        </svg>
        <h2 ref={stepHeading} tabIndex={-1} class="mt-4 text-h2 outline-none">
          ¡Recibimos tu documentación!
        </h2>
        <p class="mt-3 max-w-xl text-lead">
          Federico la va a revisar personalmente. En 24 a 48 horas hábiles te contactamos por email o WhatsApp.
        </p>
        <p class="mt-3 text-sm text-ink-muted">Te mandamos una copia de confirmación a {data.email}.</p>
      </div>
    );
  }

  const busy = progress !== null;
  return (
    <form
      onSubmit={submit}
      noValidate
      class="flex flex-col gap-8"
      aria-describedby={formError ? 'form-error' : undefined}
    >
      <ol class="grid grid-cols-3 gap-2" aria-label="Pasos del formulario">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} class="flex flex-col gap-2">
            <span class={`h-1.5 rounded-full ${i <= step ? 'bg-primary-600' : 'bg-line'}`} aria-hidden="true" />
            <span class={`text-xs font-medium sm:text-sm ${i === step ? 'text-primary-700' : 'text-ink-muted'}`}>
              <span class="sr-only">Paso </span>
              {i + 1}. {label}
              {i < step && <span class="sr-only"> (completo)</span>}
            </span>
          </li>
        ))}
      </ol>

      <h2 ref={stepHeading} tabIndex={-1} class="text-h3 outline-none">
        Paso {step + 1} de 3: {STEPS[step]}
      </h2>

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div class="hidden" aria-hidden="true">
        <label>
          Sitio web <input type="text" name="sitio_web" tabIndex={-1} autocomplete="off" />
        </label>
      </div>

      {step === 0 && (
        <div class="grid gap-5 sm:grid-cols-2">
          <TextField
            id="empresa"
            label="Empresa o razón social"
            optional
            autocomplete="organization"
            maxLength={200}
            value={data.empresa}
            onInput={(v) => set('empresa', v)}
          />
          <TextField
            id="contacto_nombre"
            label="Nombre y apellido"
            autocomplete="name"
            maxLength={160}
            value={data.contacto_nombre}
            onInput={(v) => set('contacto_nombre', v)}
            error={errors.contacto_nombre}
          />
          <TextField
            id="cargo"
            label="Cargo"
            optional
            autocomplete="organization-title"
            maxLength={120}
            value={data.cargo}
            onInput={(v) => set('cargo', v)}
          />
          <SelectField
            id="provincia"
            label="Provincia"
            placeholder="Elegí tu provincia"
            value={data.provincia}
            onChange={(v) => set('provincia', v)}
            error={errors.provincia}
            groups={[
              { label: 'Cuyo y NOA', options: PROVINCIAS_FOCO },
              { label: 'Resto del país', options: PROVINCIAS_RESTO },
            ]}
          />
          <TextField
            id="localidad"
            label="Localidad"
            optional
            autocomplete="address-level2"
            maxLength={120}
            value={data.localidad}
            onInput={(v) => set('localidad', v)}
          />
          <TextField
            id="email"
            label="Email"
            type="email"
            inputMode="email"
            autocomplete="email"
            maxLength={254}
            value={data.email}
            onInput={(v) => set('email', v)}
            error={errors.email}
          />
          <TextField
            id="whatsapp"
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            autocomplete="tel"
            maxLength={40}
            value={data.whatsapp}
            onInput={(v) => set('whatsapp', v)}
            hint="Con código de área, por ejemplo 264 555-1234."
            error={errors.whatsapp}
          />
        </div>
      )}

      {step === 1 && (
        <div class="flex flex-col gap-8">
          <div data-field="factura">
            <FileDrop
              id="factura"
              label="Factura de energía eléctrica"
              files={factura}
              maxFiles={2}
              onChange={(f) => {
                setFactura(f);
                setErrors((e) => ({ ...e, factura: undefined, archivos: undefined }));
              }}
              hint="Adjuntá la última factura completa, donde figure el consumo, la potencia contratada (kW) y los cargos por energía reactiva. Si es una foto, que se lean bien los números."
              error={errors.factura}
            />
          </div>
          <div data-field="presupuesto_solar">
            <FileDrop
              id="presupuesto_solar"
              label="Presupuesto solar de terceros"
              optional
              files={presupuesto}
              maxFiles={1}
              onChange={(f) => {
                setPresupuesto(f);
                setErrors((e) => ({ ...e, presupuesto_solar: undefined, archivos: undefined }));
              }}
              hint="Si ya te pasaron una propuesta de paneles, la revisamos sin compromiso."
              error={errors.presupuesto_solar}
            />
          </div>
          {errors.archivos && (
            <p class="text-sm font-medium text-danger" role="alert">
              {errors.archivos}
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div class="flex flex-col gap-6">
          <fieldset
            class="flex flex-col gap-2"
            data-field="objetivos"
            aria-describedby={errors.objetivos ? 'objetivos-error' : undefined}
          >
            <legend class="mb-2 text-[0.9375rem] font-semibold">
              ¿Qué querés lograr? <span class="font-normal text-ink-muted">(elegí al menos uno)</span>
            </legend>
            {GOALS.map((g) => (
              <CheckCard
                key={g.value}
                id={`obj-${g.value}`}
                checked={data.objetivos.includes(g.value)}
                onChange={(on) =>
                  set('objetivos', on ? [...data.objetivos, g.value] : data.objetivos.filter((x) => x !== g.value))
                }
              >
                {g.label}
              </CheckCard>
            ))}
            {errors.objetivos && (
              <p id="objetivos-error" class="text-sm font-medium text-danger">
                {errors.objetivos}
              </p>
            )}
          </fieldset>
          <TextField
            id="mensaje"
            label="¿Algo más que debamos saber?"
            optional
            multiline
            maxLength={4000}
            value={data.mensaje}
            onInput={(v) => set('mensaje', v)}
          />

          <section class="rounded-card border border-primary-200 bg-primary-50 p-5" aria-labelledby="garantia">
            <h3 id="garantia" class="flex items-center gap-2 text-lg">
              <svg
                viewBox="0 0 24 24"
                class="size-5 text-primary-700"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                aria-hidden="true"
              >
                <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Zm-3 9 2 2 4-4" />
              </svg>
              Garantía de confidencialidad comercial
            </h3>
            <p class="mt-2 text-[0.9375rem]">
              Tu documentación se usa solo para el diagnóstico. No se comercializa ni se transfiere a terceros ni a
              distribuidoras.
            </p>
          </section>
          <div data-field="consentimiento">
            <CheckCard
              id="consentimiento"
              checked={data.consentimiento}
              onChange={(v) => set('consentimiento', v)}
              describedById={errors.consentimiento ? 'consentimiento-error' : undefined}
            >
              Acepto la{' '}
              <a href="/confidencialidad" target="_blank" class="text-primary-700 underline underline-offset-4">
                garantía de confidencialidad
              </a>{' '}
              y la{' '}
              <a href="/privacidad" target="_blank" class="text-primary-700 underline underline-offset-4">
                política de privacidad
              </a>
              .
            </CheckCard>
            {errors.consentimiento && (
              <p id="consentimiento-error" class="mt-1.5 text-sm font-medium text-danger">
                {errors.consentimiento}
              </p>
            )}
          </div>
        </div>
      )}

      <div ref={captchaEl} />

      {formError && (
        <p id="form-error" role="alert" class="rounded-card border-l-4 border-danger bg-red-50 p-4 text-[0.9375rem]">
          {formError}
        </p>
      )}

      {busy && (
        <div class="flex flex-col gap-2" role="status">
          <div class="h-2 overflow-hidden rounded-full bg-line">
            <div
              class="h-full w-(--p) bg-primary-600 transition-[width]"
              style={{ '--p': `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
          <p class="text-sm text-ink-muted">Enviando… {Math.round((progress ?? 0) * 100)}%</p>
        </div>
      )}

      <div class="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => {
              setErrors({});
              setFormError(null);
              setStep((s) => s - 1);
            }}
            disabled={busy}
            class="min-h-11 rounded-md px-4 font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50"
          >
            ← Volver
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={busy}
          class="min-h-13 rounded-md bg-accent px-6 text-base font-semibold text-ink hover:bg-accent-hover disabled:opacity-60"
        >
          {step < 2 ? 'Siguiente' : busy ? 'Enviando…' : 'Enviar documentación para diagnóstico'}
        </button>
      </div>

      <p class="text-center text-[0.9375rem] text-ink-muted">
        ¿Preferís no completar el formulario?{' '}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener"
          data-event="whatsapp_click"
          class="font-semibold text-whatsapp underline underline-offset-4"
        >
          Enviá tu factura por WhatsApp
        </a>
      </p>
    </form>
  );
}
