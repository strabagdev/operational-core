"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withActionMessage } from "@/lib/action-redirects";
import {
  appViewFieldErrors,
  createAppView,
  friendlyAppViewError,
  getAppViewInput,
  setAppViewActive,
  updateAppView,
} from "@/lib/app-views";
import { requireAuthenticatedUser } from "@/lib/auth-guards";

async function requireUserId() {
  const user = await requireAuthenticatedUser();

  return user.id;
}

function viewsPath(contractId: string) {
  return `/app/contracts/${contractId}/settings/views`;
}

function viewPath(contractId: string, appViewId: string) {
  return `/app/contracts/${contractId}/settings/views/${appViewId}`;
}

export type AppViewActionState = {
  fieldErrors?: Record<string, string[]>;
  message?: string;
  success: boolean;
  values?: Record<string, string | string[]>;
};

export async function createAppViewAction(
  contractId: string,
  _previousState: AppViewActionState,
  formData: FormData,
): Promise<AppViewActionState> {
  const userId = await requireUserId();
  let appView: Awaited<ReturnType<typeof createAppView>>;

  try {
    appView = await createAppView(contractId, userId, getAppViewInput(formData));
  } catch (error) {
    return appViewErrorState(error, formData, "No fue posible crear la experiencia.");
  }

  if (!appView) {
    return {
      success: false,
      message: "No tienes acceso a este contrato.",
      values: preserveAppViewValues(formData),
    };
  }

  revalidatePath(viewsPath(contractId));
  redirect(viewPath(contractId, appView.id));
}

export async function updateAppViewAction(
  contractId: string,
  appViewId: string,
  _previousState: AppViewActionState,
  formData: FormData,
): Promise<AppViewActionState> {
  const userId = await requireUserId();
  let appView: Awaited<ReturnType<typeof updateAppView>>;

  try {
    appView = await updateAppView(contractId, appViewId, userId, getAppViewInput(formData));
  } catch (error) {
    return appViewErrorState(error, formData, "No fue posible guardar la experiencia.");
  }

  if (!appView) {
    return {
      success: false,
      message: "No se encontró la vista.",
      values: preserveAppViewValues(formData),
    };
  }

  revalidatePath(viewsPath(contractId));
  revalidatePath(viewPath(contractId, appViewId));
  redirect(withActionMessage(viewPath(contractId, appViewId), "notice", "Vista guardada."));
}

export async function toggleAppViewAction(
  contractId: string,
  appViewId: string,
  active: boolean,
) {
  const userId = await requireUserId();
  const appView = await setAppViewActive(contractId, appViewId, userId, active);

  if (!appView) {
    redirect(withActionMessage(viewsPath(contractId), "error", "No se encontró la vista."));
  }

  revalidatePath(viewsPath(contractId));
}

function appViewErrorState(
  error: unknown,
  formData: FormData,
  fallbackMessage: string,
): AppViewActionState {
  const message = friendlyAppViewError(error);

  return {
    success: false,
    message: message === "No fue posible guardar la vista." ? fallbackMessage : message,
    fieldErrors: appViewFieldErrors(error),
    values: preserveAppViewValues(formData),
  };
}

function preserveAppViewValues(formData: FormData) {
  const values: AppViewActionState["values"] = {};

  for (const [key, value] of formData.entries()) {
    const text = typeof value === "string" ? value : value.name;
    const previous = values[key];

    if (previous === undefined) {
      values[key] = text;
    } else if (Array.isArray(previous)) {
      previous.push(text);
    } else {
      values[key] = [String(previous), text];
    }
  }

  return values;
}
