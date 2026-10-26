"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth-guards";
import { activateSchedulePolicy, createScheduleCatalog, publishScheduleRevision, retireSchedule, scheduleRevisionFromForm, ScheduleError } from "@/lib/state-update-schedules";

export async function scheduleAction(contractId:string,appViewId:string,form:FormData) {
  const user=await requireAuthenticatedUser();
  const get=(key:string)=>{const value=form.get(key);return typeof value==="string"?value:"";};
  const path=`/app/contracts/${contractId}/settings/views/${appViewId}`;
  let message="Horario guardado";
  try {
    switch(get("command")) {
      case "catalog":await createScheduleCatalog(contractId,user.id,{name:get("name"),timeZone:get("timeZone")});break;
      case "publish":await publishScheduleRevision(contractId,user.id,get("catalogId"),{scheduleRecordId:get("scheduleRecordId")||undefined,code:get("code"),...scheduleRevisionFromForm(form)});message="Revisión publicada; las aplicaciones anteriores se conservan";break;
      case "retire":await retireSchedule(contractId,user.id,get("catalogId"),get("scheduleRecordId"),get("retiredFrom"));break;
      case "activate":await activateSchedulePolicy(contractId,user.id,get("targetId"),{catalogId:get("catalogId"),sourceFieldId:get("sourceFieldId"),activeFrom:get("activeFrom"),optionBindings:[...form.entries()].filter(([key])=>key.startsWith("binding:")).map(([key,value])=>({optionId:key.slice(8),scheduleRecordId:String(value)}))});message="Política compartida activada explícitamente para nuevas aplicaciones";break;
      default:throw new ScheduleError("INVALID_SCHEDULE_COMMAND","Acción de horario inválida.");
    }
  } catch(error) {
    if (!(error instanceof ScheduleError) && !(error instanceof ZodError)) throw error;
    redirect(path+"?scheduleError="+encodeURIComponent(error instanceof ScheduleError?error.message:"Revisa los campos del horario."));
  }
  revalidatePath(path);
  redirect(path+"?scheduleNotice="+encodeURIComponent(message));
}
