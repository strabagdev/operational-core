import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import type { PanelFilter } from "./app-views";
import { parseOperationalCalendar, operationalCalendarKey, OperationalCalendarError } from "./operational-calendar";

export class PanelOperationalCalendarError extends Error {}

/** A reference grants metadata only, never access to the workflow's subjects or writes. */
export async function resolvePanelOperationalFilters(filters: PanelFilter[], contractId: string, client: Pick<Prisma.TransactionClient,"appView"> = prisma) {
  if (!filters.some(f => f.defaultValue?.type === "OPERATIONAL_TODAY")) return filters;
  return Promise.all(filters.map(async filter => {
    const initial = filter.defaultValue;
    if (initial?.type !== "OPERATIONAL_TODAY") return filter;
    const source = await client.appView.findFirst({ where: { id: initial.calendarAppViewId, contractId, active: true, type: "WORKFLOW" }, select: { config: true } });
    const config = source?.config as { workflowKey?: string; operationalCalendar?: unknown } | undefined;
    let calendar;
    try {calendar = config?.workflowKey === "attendance" ? parseOperationalCalendar(config.operationalCalendar) : undefined;}
    catch(error){if(error instanceof OperationalCalendarError)throw new PanelOperationalCalendarError("El calendario operativo vinculado no es válido. Se conserva la consulta guardada.");throw error;}
    if (!calendar) throw new PanelOperationalCalendarError("La experiencia vinculada no tiene un calendario operativo disponible. Se conserva la consulta guardada.");
    return { ...filter, defaultValue: { ...initial, calendar, calendarKey: operationalCalendarKey(calendar) } };
  }));
}
