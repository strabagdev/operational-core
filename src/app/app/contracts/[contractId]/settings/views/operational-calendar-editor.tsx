"use client";
import { useState } from "react";
import type { OperationalCalendar } from "@/lib/operational-calendar";

export function OperationalCalendarEditor({ initial, options, errors }: {
  initial?: OperationalCalendar; options: { id: string; label: string; isActive: boolean }[]; errors?: string[];
}) {
  const [enabled, setEnabled] = useState(!!initial);
  const [calendar, setCalendar] = useState<OperationalCalendar>(initial ?? { version: 1, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, dayStart: "00:00", bands: [] });
  return <fieldset className="grid gap-3 rounded-md border border-border p-4">
    <legend>Día operativo y franjas (opcional)</legend>
    <input type="hidden" name="operationalCalendar" value={enabled ? JSON.stringify(calendar) : ""}/>
    <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>Usar calendario operativo</label>
    {enabled ? <>
      <label className="grid gap-1">Zona IANA del día operativo<input value={calendar.timeZone} onChange={e => setCalendar({ ...calendar, timeZone: e.target.value })} className="min-h-11 rounded border px-3"/></label>
      <label className="grid gap-1">Inicio del día operativo<input type="time" step={60} value={calendar.dayStart} onChange={e => setCalendar({ ...calendar, dayStart: e.target.value })} className="min-h-11 rounded border px-3"/></label>
      <p className="text-sm text-muted-foreground">Afecta sólo nuevas confirmaciones automáticas. La fecha manual y la selección del estado se conservan. Cada intervalo incluye el inicio y excluye el final; un final anterior al inicio cruza medianoche. Un intervalo vacío o solapado no se puede guardar.</p>
      {calendar.bands.map((band, index) => <div key={index} className="grid gap-2 sm:grid-cols-4">
        <label className="grid gap-1">Opción configurada<select value={band.optionId} onChange={e => setCalendar({ ...calendar, bands: calendar.bands.map((b, i) => i === index ? { ...b, optionId: e.target.value } : b) })} className="min-h-11 rounded border"><option value="">Seleccionar opción</option>{options.filter(o => o.isActive).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label className="grid gap-1">Desde<input type="time" value={band.start} onChange={e => setCalendar({ ...calendar, bands: calendar.bands.map((b, i) => i === index ? { ...b, start: e.target.value } : b) })} className="min-h-11 rounded border"/></label>
        <label className="grid gap-1">Hasta (exclusivo)<input type="time" value={band.end} onChange={e => setCalendar({ ...calendar, bands: calendar.bands.map((b, i) => i === index ? { ...b, end: e.target.value } : b) })} className="min-h-11 rounded border"/></label>
        <button type="button" className="min-h-11 rounded border" onClick={() => setCalendar({ ...calendar, bands: calendar.bands.filter((_, i) => i !== index) })}>Quitar franja</button>
      </div>)}
      <button type="button" className="min-h-11 justify-self-start rounded border px-3" onClick={() => setCalendar({ ...calendar, bands: [...calendar.bands, { optionId: "", start: "", end: "" }] })}>Agregar franja</button>
      <p className="text-sm text-muted-foreground">Los huecos horarios no asignan una franja. En un cambio de hora se usa la primera ocurrencia del inicio; si no existe, el primer instante válido posterior. No se corrige el reloj ni se reasignan históricos.</p>
    </> : null}
    {errors?.length ? <p role="alert" className="text-sm text-destructive">{errors.join(" ")}</p> : null}
  </fieldset>;
}
