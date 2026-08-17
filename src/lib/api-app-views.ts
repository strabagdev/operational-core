import type { AppView, AppViewType } from "@prisma/client";

import { getEffectiveAppViewsForUserContract } from "./app-view-access";
import { parseAppViewConfig, type AppViewConfig } from "./app-views";

type ApiAppView = Pick<AppView, "config" | "icon" | "id" | "name" | "slug" | "sortOrder" | "type">;

export type SerializedApiAppView = {
  config: Omit<AppViewConfig, "type">;
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
