import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppViewConfig } from "@/lib/app-views";
import { prisma } from "@/lib/prisma";
import { scheduleEditorData, scheduleConsumer, nominalScheduleMinutes } from "@/lib/state-update-schedules";
import { scheduleAction } from "./schedule-actions";

const inputClass="rounded border border-input bg-background p-2 text-sm";
export async function SchedulePanel({contractId,appViewId,userId,config,error,notice}:{contractId:string;appViewId:string;userId:string;config:AppViewConfig;error?:string;notice?:string}) {
  if(config.type!=="WORKFLOW" || config.workflowKey!=="state-update" || config.uniqueness.mode!=="subject-date-fields" || config.historyMode!=="update-current")return null;
  const catalog=await scheduleEditorData(contractId,userId);
  const target=await prisma.entityType.findFirstOrThrow({where:{id:config.targetEntityTypeId,contractId},include:{fields:{where:{isActive:true},include:{options:true}}}});
  const policy=scheduleConsumer(target.scheduleConfig);
  const action=scheduleAction.bind(null,contractId,appViewId);
  const hidden=(command:string)=><><input type="hidden" name="command" value={command}/>{catalog?<input type="hidden" name="catalogId" value={catalog.id}/>:null}</>;
  return <Card><CardHeader><CardTitle>Horarios y jornadas</CardTitle></CardHeader><CardContent className="grid gap-5">
    <p className="text-sm text-muted-foreground">Opcional. Comparte catálogo en el contrato y política en la entidad destino. Guardar la experiencia no activa horarios. Publicar una revisión conserva los horarios aplicados a reportes existentes.</p>
    {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {!catalog?<form action={action} className="grid gap-3">{hidden("catalog")}<label className="grid gap-1">Nombre del catálogo<input className={inputClass} name="name" required/></label><label className="grid gap-1">Zona IANA del contrato<input className={inputClass} name="timeZone" placeholder="Área/Ciudad" required/></label><Button className="w-fit">Crear catálogo reutilizable</Button></form>:<>
      <p>{catalog.name} · {catalog.config.timeZone}</p>
      <div className="grid gap-3">{catalog.codes.map(code=><details key={code.id} className="rounded border p-3"><summary>{code.name}{code.retiredFrom?` · Retirado desde ${code.retiredFrom}`:""}</summary><ul className="my-3 grid gap-2 text-sm">{code.revisions.map(revision=><li key={revision.id}>R{revision.sequence} · {revision.name} · {revision.startTime}–{revision.endTime}{revision.endDayOffset?" (+1 día)":""} · {nominalScheduleMinutes(revision.startTime,revision.endTime,revision.endDayOffset)} min nominales · Desde {revision.effectiveFrom}</li>)}</ul>
        {!code.retiredFrom?<form action={action} className="flex flex-wrap items-end gap-2">{hidden("retire")}<input type="hidden" name="scheduleRecordId" value={code.id}/><label className="grid gap-1">Retiro efectivo (no retrospectivo)<input className={inputClass} type="date" name="retiredFrom" required/></label><Button variant="outline">Confirmar retiro</Button></form>:null}
      </details>)}</div>
      <details><summary>Publicar revisión inmutable</summary><form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">{hidden("publish")}
        <label className="grid gap-1">Horario<select name="scheduleRecordId" className={inputClass}><option value="">Nuevo código</option>{catalog.codes.filter(code=>code.canPublish).map(code=><option key={code.id} value={code.id}>{code.name}</option>)}</select></label><label className="grid gap-1">Código (sólo nuevo horario)<input name="code" className={inputClass}/></label>
        <label className="grid gap-1">Nombre de la revisión<input name="name" className={inputClass} required/></label><label className="grid gap-1">Vigencia inicial explícita<input name="effectiveFrom" type="date" className={inputClass} required/></label>
        <label className="grid gap-1">Inicio<input name="startTime" type="time" className={inputClass} required/></label><label className="grid gap-1">Término<input name="endTime" type="time" className={inputClass} required/></label>
        <label className="grid gap-1">Día del término<select name="endDayOffset" className={inputClass}><option value="0">Mismo día</option><option value="1">Día siguiente</option></select></label>
        <p className="text-sm text-muted-foreground">Duración nominal de reloj; no calcula horas trabajadas. Nuevas revisiones posteriores requieren inicio futuro.</p><Button className="w-fit">Publicar revisión</Button>
      </form></details>
      {policy?<p>Política activada desde {policy.activeFrom}. El horario aplicado se conserva al editar; no se completan reportes históricos. Las vinculaciones no se cambian aquí.</p>:<details><summary>Activar horario en esta entidad destino</summary><p className="my-3 text-sm">Afecta a todas sus AppViews. Debe existir una revisión por opción y los clientes deben ser compatibles. La fecha inicial puede cubrir altas tardías. No modifica la identidad del reporte ni completa históricos.</p>
        {target.fields.filter(field=>(config.uniqueness.fieldIds??[]).includes(field.id)).map(field=><form key={field.id} action={action} className="my-4 grid gap-3 rounded border p-3">{hidden("activate")}<input type="hidden" name="targetId" value={target.id}/><input type="hidden" name="sourceFieldId" value={field.id}/><strong>Vincular {field.name}</strong>{field.options.filter(o=>o.isActive).map(option=><label key={option.id} className="grid gap-1">{option.label}<select className={inputClass} name={"binding:"+option.id} required><option value="">Seleccionar horario</option>{catalog.codes.filter(code=>code.canPublish).map(code=><option key={code.id} value={code.id}>{code.name}</option>)}</select></label>)}<label className="grid gap-1">Activar desde<input name="activeFrom" type="date" className={inputClass} required/></label><Button className="w-fit">Confirmar activación compartida</Button></form>)}
      </details>}
    </>}
  </CardContent></Card>;
}
