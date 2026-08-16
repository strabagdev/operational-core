"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withActionMessage } from "@/lib/action-redirects";
import {
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

export async function createAppViewAction(contractId: string, formData: FormData) {
  const userId = await requireUserId();
  let appView: Awaited<ReturnType<typeof createAppView>>;

  try {
    appView = await createAppView(contractId, userId, getAppViewInput(formData));
  } catch (error) {
    redirect(withActionMessage(viewsPath(contractId), "error", friendlyAppViewError(error)));
  }

  if (!appView) {
    redirect(withActionMessage(viewsPath(contractId), "error", "No tienes acceso a este contrato."));
  }

  revalidatePath(viewsPath(contractId));
  redirect(viewPath(contractId, appView.id));
}

export async function updateAppViewAction(
  contractId: string,
  appViewId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let appView: Awaited<ReturnType<typeof updateAppView>>;

  try {
    appView = await updateAppView(contractId, appViewId, userId, getAppViewInput(formData));
  } catch (error) {
    redirect(withActionMessage(viewPath(contractId, appViewId), "error", friendlyAppViewError(error)));
  }

  if (!appView) {
    redirect(withActionMessage(viewsPath(contractId), "error", "No se encontró la vista."));
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
