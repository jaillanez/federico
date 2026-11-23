/** Short contact form (origen=contacto) shown on /sobre-federico. Same endpoint as the diagnosis. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { looksLikeEmail, normalizeArPhone } from '@/lib/phone';
import { readUtm } from '@/lib/utm';
import { createTurnstile, type TurnstileHandle } from '@/lib/turnstile';
import { postForm } from '@/lib/upload';
import { track } from '@/lib/analytics';
import { CheckCard, TextField } from './forms/fields';

interface Props {
  turnstileSiteKey: string;
}
type Errors = Partial<Record<string, string>>;

export default function ContactoForm({ turnstileSiteKey }: Props) {
  const [v, setV] = useState({ contacto_nombre: '', email: '', whatsapp: '', mensaje: '', consentimiento: false });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const captchaEl = useRef<HTMLDivElement>(null);
  const captcha = useRef<Promise<TurnstileHandle> | null>(null);
  const doneHeading = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!captchaEl.current) return;
    const ready = createTurnstile(captchaEl.current, turnstileSiteKey);
    ready.catch(() => setFormError('No pudimos cargar la verificación anti-spam. Revisá tu conexión.'));
    captcha.current = ready;
    return () => void ready.then((h) => h.destroy()).catch(() => undefined);
  }, [turnstileSiteKey]);
  useEffect(() => {
    if (done) doneHeading.current?.focus();
  }, [done]);

  const set = (k: keyof typeof v, value: string | boolean) => {
    setV((s) => ({ ...s, [k]: value }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    // Honeypot: if a bot filled the hidden field, send it so the API discards the lead.
    const trap = (e.currentTarget as HTMLFormElement | null)?.querySelector<HTMLInputElement>('[name="sitio_web"]');
    const errs: Errors = {};
    if (!v.contacto_nombre.trim()) errs.contacto_nombre = 'Ingresá tu nombre.';
    if (!looksLikeEmail(v.email)) errs.email = 'Ingresá un email válido.';
    if (v.whatsapp.trim() && !normalizeArPhone(v.whatsapp)) errs.whatsapp = 'Revisá el número (con código de área).';
    if (!v.mensaje.trim()) errs.mensaje = 'Escribí tu consulta.';
    if (!v.consentimiento) errs.consentimiento = 'Tenés que aceptar la política de privacidad.';
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) return document.getElementById(`c-${first}`)?.focus();

    setBusy(true);
    setFormError(null);
    try {
      if (!captcha.current) throw new Error('captcha');
      const token = await (await captcha.current).getToken();
      const body = new FormData();
      body.set('origen', 'contacto');
      body.set('contacto_nombre', v.contacto_nombre.trim());
      body.set('email', v.email.trim());
      if (v.whatsapp.trim()) body.set('whatsapp', v.whatsapp.trim());
      body.set('mensaje', v.mensaje.trim());
      body.set('consentimiento', 'true');
      for (const [k, val] of Object.entries(readUtm())) if (val) body.set(k, val);
      body.set('cf-turnstile-response', token);
      if (trap?.value) body.set('sitio_web', trap.value);
      const res = await postForm('/api/leads', body);
      if (res.ok) {
        track('lead_enviado', { origen: 'contacto' });
        setDone(true);
      } else {
        setErrors(Object.fromEntries(Object.entries(res.error.fields)));
        setFormError(res.error.message);
      }
    } catch {
      setFormError('No pudimos verificar que seas una persona. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p
        ref={doneHeading}
        tabIndex={-1}
        role="status"
        class="rounded-card border border-green-200 bg-green-50 p-6 text-lead outline-none"
      >
        ¡Recibimos tu mensaje! Te respondemos a la brevedad.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate class="grid gap-5 sm:grid-cols-2">
      <div class="hidden" aria-hidden="true">
        <input type="text" name="sitio_web" tabIndex={-1} autocomplete="off" />
      </div>
      <TextField
        id="c-contacto_nombre"
        label="Nombre"
        autocomplete="name"
        value={v.contacto_nombre}
        onInput={(x) => set('contacto_nombre', x)}
        error={errors.contacto_nombre}
      />
      <TextField
        id="c-email"
        label="Email"
        type="email"
        inputMode="email"
        autocomplete="email"
        value={v.email}
        onInput={(x) => set('email', x)}
        error={errors.email}
      />
      <div class="sm:col-span-2">
        <TextField
          id="c-whatsapp"
          label="Teléfono"
          optional
          type="tel"
          inputMode="tel"
          autocomplete="tel"
          value={v.whatsapp}
          onInput={(x) => set('whatsapp', x)}
          error={errors.whatsapp}
        />
      </div>
      <div class="sm:col-span-2">
        <TextField
          id="c-mensaje"
          label="Mensaje"
          multiline
          maxLength={4000}
          value={v.mensaje}
          onInput={(x) => set('mensaje', x)}
          error={errors.mensaje}
        />
      </div>
      <div class="sm:col-span-2">
        <CheckCard
          id="c-consentimiento"
          checked={v.consentimiento}
          onChange={(x) => set('consentimiento', x)}
          describedById={errors.consentimiento ? 'c-consentimiento-error' : undefined}
        >
          Acepto la{' '}
          <a href="/privacidad" target="_blank" class="text-primary-700 underline underline-offset-4">
            política de privacidad
          </a>
          .
        </CheckCard>
        {errors.consentimiento && (
          <p id="c-consentimiento-error" class="mt-1.5 text-sm font-medium text-danger">
            {errors.consentimiento}
          </p>
        )}
      </div>
      <div ref={captchaEl} class="sm:col-span-2" />
      {formError && (
        <p role="alert" class="rounded-card border-l-4 border-danger bg-red-50 p-4 text-[0.9375rem] sm:col-span-2">
          {formError}
        </p>
      )}
      <div class="sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          class="min-h-11 rounded-md bg-primary-600 px-5 font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {busy ? 'Enviando…' : 'Enviar mensaje'}
        </button>
      </div>
    </form>
  );
}
