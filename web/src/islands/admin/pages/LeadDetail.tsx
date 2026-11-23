import { useEffect, useState } from 'preact/hooks';
import { ApiError, ESTADOS, GOAL_LABELS, get, patch, post, type Estado, type LeadDetail as L } from '../api';
import { Badge, Btn, Card, ErrorBox, PageTitle, Spinner, fmtBytes, fmtDateTime } from '../ui';
import { TextField } from '../../forms/fields';

export default function LeadDetail({ id }: { id: string }) {
  const [lead, setLead] = useState<L | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>('nuevo');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<L>(`/admin/leads/${id}`).then(
      (l) => {
        setLead(l);
        setEstado(l.estado);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);

  const save = async (e: Event) => {
    e.preventDefault();
    if (!lead) return;
    setBusy(true);
    setError(null);
    try {
      const updated =
        estado !== lead.estado
          ? await patch<L>(`/admin/leads/${id}`, { estado, nota: nota.trim() || null })
          : await post<L>(`/admin/leads/${id}/notes`, { texto: nota.trim() });
      setLead(updated);
      setNota('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !lead) return <ErrorBox error={error} />;
  if (!lead) return <Spinner />;
  const first = lead.contacto_nombre.split(' ')[0];
  const wa = lead.whatsapp
    ? `https://wa.me/${lead.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${first}, soy Federico Delgado de S.E.I. Te escribo por la consulta que dejaste en la web.`)}`
    : null;
  const mail = `mailto:${lead.email}?subject=${encodeURIComponent('Tu consulta en S.E.I.')}&body=${encodeURIComponent(`Hola ${first},\n\n`)}`;
  const st = ESTADOS.find((s) => s.value === lead.estado);
  const rows: [string, string | null][] = [
    ['Contacto', `${lead.contacto_nombre}${lead.cargo ? ` (${lead.cargo})` : ''}`],
    ['Email', lead.email],
    ['WhatsApp', lead.whatsapp],
    ['Ubicación', [lead.localidad, lead.provincia].filter(Boolean).join(', ') || null],
    ['Recibida', fmtDateTime(lead.created_at)],
    ['Origen', lead.origen === 'contacto' ? 'Formulario de contacto' : 'Diagnóstico Exprés'],
    ['Campaña', [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ') || null],
  ];

  return (
    <>
      <a href="#/consultas" class="text-sm font-semibold text-primary-700">
        ← Consultas
      </a>
      <PageTitle actions={<Badge tone={st?.tone}>{st?.label}</Badge>}>{lead.empresa ?? lead.contacto_nombre}</PageTitle>
      <div class="mb-4 flex flex-wrap gap-2">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener"
            class="inline-flex min-h-11 items-center rounded-md bg-whatsapp px-4 font-semibold text-white"
          >
            Responder por WhatsApp
          </a>
        )}
        <a
          href={mail}
          class="inline-flex min-h-11 items-center rounded-md border border-line bg-white px-4 font-semibold hover:border-primary-300"
        >
          Responder por email
        </a>
      </div>
      <div class="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div class="flex flex-col gap-4">
          <Card>
            <h2 class="text-h3">Datos</h2>
            <dl class="mt-3 divide-y divide-line text-[0.9375rem]">
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} class="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
                    <dt class="text-ink-muted">{k}</dt>
                    <dd class="break-words">{v}</dd>
                  </div>
                ))}
            </dl>
            {lead.objetivos.length > 0 && (
              <>
                <h3 class="mt-4 text-base font-semibold">Objetivos</h3>
                <ul class="mt-2 flex flex-wrap gap-2">
                  {lead.objetivos.map((g) => (
                    <li key={g}>
                      <Badge tone="bg-primary-50 text-primary-700 ring-primary-200">{GOAL_LABELS[g] ?? g}</Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {lead.mensaje && (
              <>
                <h3 class="mt-4 text-base font-semibold">Mensaje</h3>
                <p class="mt-1 whitespace-pre-line">{lead.mensaje}</p>
              </>
            )}
          </Card>
          <Card>
            <h2 class="text-h3">Archivos</h2>
            {lead.archivos.length === 0 ? (
              <p class="mt-2 text-ink-muted">Sin archivos.</p>
            ) : (
              <ul class="mt-3 flex flex-col gap-2">
                {lead.archivos.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`/api/admin/leads/${lead.id}/files/${f.id}`}
                      class="flex items-center justify-between gap-3 rounded-md border border-line p-3 hover:border-primary-300"
                    >
                      <span class="min-w-0">
                        <span class="block truncate font-medium">{f.nombre_original}</span>
                        <span class="text-sm text-ink-muted">
                          {f.tipo === 'factura'
                            ? 'Factura'
                            : f.tipo === 'presupuesto_solar'
                              ? 'Presupuesto solar'
                              : 'Otro'}{' '}
                          · {fmtBytes(f.bytes)}
                        </span>
                      </span>
                      <span class="shrink-0 text-sm font-semibold text-primary-700">Descargar</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p class="mt-2 text-xs text-ink-muted">Los enlaces de descarga vencen a los 5 minutos.</p>
          </Card>
        </div>
        <div class="flex flex-col gap-4">
          <Card>
            <form onSubmit={save} class="flex flex-col gap-3">
              <h2 class="text-h3">Seguimiento</h2>
              <label for="estado" class="text-sm font-medium">
                Estado
              </label>
              <select
                id="estado"
                class="min-h-11 rounded-md border border-line px-3"
                value={estado}
                onChange={(e) => setEstado(e.currentTarget.value as Estado)}
              >
                {ESTADOS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <TextField
                id="nota"
                label="Nota interna"
                optional
                multiline
                value={nota}
                onInput={setNota}
                maxLength={4000}
              />
              <ErrorBox error={error} />
              <Btn type="submit" disabled={busy || (estado === lead.estado && !nota.trim())}>
                {busy ? 'Guardando…' : 'Guardar'}
              </Btn>
            </form>
          </Card>
          <Card>
            <h2 class="text-h3">Historial</h2>
            {lead.notas.length === 0 ? (
              <p class="mt-2 text-ink-muted">Todavía no hay movimientos.</p>
            ) : (
              <ol class="mt-3 flex flex-col gap-3 border-l-2 border-line pl-4">
                {lead.notas.map((n) => (
                  <li key={n.id} class="text-sm">
                    <p class="text-ink-muted">
                      {fmtDateTime(n.created_at)}
                      {n.autor ? ` · ${n.autor}` : ''}
                    </p>
                    {n.estado_nuevo && (
                      <p class="font-medium">
                        {ESTADOS.find((s) => s.value === n.estado_anterior)?.label} →{' '}
                        {ESTADOS.find((s) => s.value === n.estado_nuevo)?.label}
                      </p>
                    )}
                    {n.texto && <p class="whitespace-pre-line">{n.texto}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
