import type { AppViewType } from "@prisma/client";

import { slugify } from "./format";
import { workflowOptions } from "./workflow-catalog";

export const appViewTypeOptions = [
  { label: "Registros", value: "RECORDS" },
  { label: "Flujo", value: "WORKFLOW" },
  { label: "Reporte", value: "REPORT" },
  { label: "Tablero", value: "BOARD" },
  { label: "Dashboard", value: "DASHBOARD" },
  { label: "Panel", value: "PANEL" },
] as const satisfies Array<{ label: string; value: AppViewType }>;

export const appViewWorkflowOptions = [...workflowOptions] as const;

export function suggestedAppViewSlug(name: string) {
  return slugify(name);
}
