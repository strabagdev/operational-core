import { resolvePanelOperationalFilters, PanelOperationalCalendarError } from "./panel-operational-calendar";
import type { AppView, AppViewType } from "@prisma/client";

import { getEffectiveAppViewsForUserContract } from "./app-view-access";
import { parseAppViewConfig, type AppViewConfig } from "./app-views";
import { panelConfigRevision } from "./panels";
import { panelCompatibility, panelUpdatePlaceholder, type PanelCompatibility } from "./panel-consumer";

type ApiAppView = Pick<AppView, "config" | "icon" | "id" | "name" | "slug" | "sortOrder" | "type">;

export type SerializedApiAppView = {
  config: Omit<AppViewConfig, "type">;
  configRevision?: string;
  panelCompatibility?: PanelCompatibility;
  icon: string | null;
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  type: AppViewType;
};

export async function getApiContractViews({
  contractId,
  userId,
}: {
  contractId: string;
  userId: string;
}) {
  return getEffectiveAppViewsForUserContract({ contractId, userId });
}

export function serializeApiAppViews(views: ApiAppView[]) {
  const serialized: SerializedApiAppView[] = [];

  for (const view of views) {
    const item = serializeApiAppView(view);

    if (item) {
      serialized.push(item);
    }
  }

  return serialized;
}

export function serializeApiAppView(view: ApiAppView): SerializedApiAppView | null {
  try {
    const config = parseAppViewConfig(view);
    const normalizedConfig = { ...config } as Record<string, unknown>;
    delete normalizedConfig.type;

    return {
      config: normalizedConfig as Omit<AppViewConfig, "type">,
      ...(config.type === "PANEL" ? { configRevision: panelConfigRevision(config) } : {}),
      icon: view.icon ?? null,
      id: view.id,
      name: view.name,
      slug: view.slug,
      sortOrder: view.sortOrder,
      type: view.type,
    };
  } catch (error) {
    console.error("Invalid AppView config omitted from API response.", {
      appViewId: view.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return null;
  }
}

/** Transport projection only. Stored definitions and all compatible views remain unchanged. */
export function projectPanelViewsForConsumer(views: SerializedApiAppView[], consumer: readonly string[]) {
  return views.map(view => {
    if (view.type !== "PANEL") return view;
    const config = { ...view.config, type: "PANEL" } as import("./app-views").PanelConfig;
    const compatibility = panelCompatibility(config, view.configRevision!, consumer);
    if (!compatibility) return view;
    return { ...view, panelCompatibility: compatibility,
      ...(compatibility.status === "update-required" ? { config: panelUpdatePlaceholder(config) } : {}) };
  });
}

export async function resolveApiOperationalCalendars(views:SerializedApiAppView[],contractId:string) {
 return Promise.all(views.map(async view=>{
   if(view.type!=="PANEL")return view;
   const config={...view.config,type:"PANEL"}as import("./app-views").PanelConfig;
   if(!config.filters.some(f=>f.defaultValue?.type==="OPERATIONAL_TODAY"))return view;
   let resolved;
   try {resolved={...config,filters:await resolvePanelOperationalFilters(config.filters,contractId)};}
   catch(error){if(error instanceof PanelOperationalCalendarError)return view;throw error;}
   return{...view,config:{...view.config,filters:resolved.filters},configRevision:panelConfigRevision(resolved)};
 }));
}
