import { useEffect, useState } from 'preact/hooks';
import { ApiError, get, put, type Settings as S } from '../api';
import { Btn, Card, ErrorBox, PageTitle, Spinner } from '../ui';
import { TextField } from '../../forms/fields';
import { notifyPublicChange } from '../AdminApp';

export default function Settings() {
  const [s, setS] = useState<S | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    get<S>('/admin/settings').then(setS, (e: Error) => setError(e.message));
  }, []);
  if (!s) return error ? <ErrorBox error={error} /> : <Spinner />;

  const setC = (k: keyof S['contacto'], v: string) => {
    setSaved(false);
    setS({ ...s, contacto: { ...s.contacto, [k]: v } });
  };
  const setM = (i: number, k: 'etiqueta' | 'valor' | 'sufijo', v: string) => {
    setSaved(false);
    const metricas = s.metricas.map((m, j) =>
      j !== i ? m : { ...m, [k]: k === 'valor' ? (v === '' ? null : Number(v)) : v || null },
    );
    setS({ ...s, metricas });
  };
  const save = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setFields({});
    try {
      setS(await put<S>('/admin/settings', s as unknown as Record<string, unknown>));
      setSaved(true);
      notifyPublicChange();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError('No se pudo guardar.');
    }
  };
  return (
    <>
      <PageTitle>Configuración</PageTitle>
      <form onSubmit={save} class="flex max-w-3xl flex-col gap-4" noValidate>
        <Card>
          <h2 class="text-h3">Contacto</h2>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField
              id="s-dir"
              label="Dirección"
              value={s.contacto.direccion}
              onInput={(v) => setC('direccion', v)}
            />
            <TextField
              id="s-email"
              label="Email"
              type="email"
              value={s.contacto.email}
              onInput={(v) => setC('email', v)}
            />
            <TextField
              id="s-tel"
              label="Teléfono fijo"
              value={s.contacto.telefono}
              onInput={(v) => setC('telefono', v)}
            />
            <TextField id="s-cel" label="Celular" value={s.contacto.celular} onInput={(v) => setC('celular', v)} />
            <TextField
              id="s-wa"
              label="WhatsApp"
              value={s.whatsapp.numero}
              onInput={(v) => {
                setSaved(false);
                setS({ ...s, whatsapp: { numero: v.replace(/\D/g, '') } });
              }}
              hint="Formato internacional sin espacios: 549 + código de área + número (ej. 5492645651609)."
              error={fields['whatsapp.numero']}
            />
          </div>
        </Card>
        <Card>
          <h2 class="text-h3">Cifras del inicio</h2>
          <p class="mt-1 text-sm text-ink-muted">Solo se muestran las que tienen un valor. Usá datos reales.</p>
          <div class="mt-3 flex flex-col gap-3">
            {s.metricas.map((m, i) => (
              <div key={m.clave} class="grid grid-cols-[1fr_6rem_4rem] gap-2">
                <TextField
                  id={`m-${i}-e`}
                  label="Etiqueta"
                  value={m.etiqueta}
                  onInput={(v) => setM(i, 'etiqueta', v)}
                />
                <TextField
                  id={`m-${i}-v`}
                  label="Valor"
                  optional
                  inputMode="numeric"
                  value={m.valor?.toString() ?? ''}
                  onInput={(v) => setM(i, 'valor', v)}
                />
                <TextField
                  id={`m-${i}-s`}
                  label="Sufijo"
                  optional
                  value={m.sufijo ?? ''}
                  onInput={(v) => setM(i, 'sufijo', v)}
                  maxLength={10}
                />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <TextField
            id="s-tg"
            label="Límite de tg φ (calculadora)"
            inputMode="numeric"
            value={String(s.tg_phi_limite)}
            onInput={(v) => setS({ ...s, tg_phi_limite: Number(v.replace(',', '.')) })}
            hint="Habitualmente 0,62 (cos φ 0,85). Confirmalo con la distribuidora."
          />
        </Card>
        <ErrorBox error={error} />
        {saved && (
          <p role="status" class="font-medium text-success">
            Guardado. El sitio se va a actualizar en unos minutos.
          </p>
        )}
        <Btn type="submit" variant="accent" class="self-start">
          Guardar configuración
        </Btn>
      </form>
    </>
  );
}
