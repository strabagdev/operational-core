"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { safeAppRedirectPath, withActionMessage } from "@/lib/action-redirects";
import { requireAuthenticatedUser } from "@/lib/auth-guards";
import {
  createExternalAppForAdmin,
  externalAppAdminFriendlyError,
  getExternalAppFormInput,
  setExternalAppActiveForAdmin,
  updateExternalAppForAdmin,
} from "@/lib/external-app-admin";

const appsPath = "/app/settings/apps";

async function requireUserId() {
  const user = await requireAuthenticatedUser();

  return user.id;
}

function redirectPath(formData: FormData, key: "returnTo" | "successTo") {
  return safeAppRedirectPath(formData.get(key), appsPath);
}

function withMessage(path: string, key: "error" | "notice", message: string) {
  return withActionMessage(path, key, message);
}

export async function createExternalAppAction(formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");

  try {
    await createExternalAppForAdmin(userId, getExternalAppFormInput(formData));
  } catch (error) {
    redirect(withMessage(returnTo, "error", externalAppAdminFriendlyError(error)));
  }

  revalidatePath(appsPath);
  redirect(withMessage(successTo, "notice", "Aplicación creada."));
}

export async function updateExternalAppAction(appId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");

  try {
    const app = await updateExternalAppForAdmin(
      userId,
      appId,
      getExternalAppFormInput(formData),
    );

    if (!app) {
      redirect(withMessage(returnTo, "error", "No se encontró la aplicación."));
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", externalAppAdminFriendlyError(error)));
  }

  revalidatePath(appsPath);
  redirect(withMessage(successTo, "notice", "Aplicación actualizada."));
}

export async function setExternalAppActiveAction(
  appId: string,
  active: boolean,
  formData: FormData,
) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");

  try {
    const app = await setExternalAppActiveForAdmin(userId, appId, active);

    if (!app) {
      redirect(withMessage(returnTo, "error", "No se encontró la aplicación."));
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", externalAppAdminFriendlyError(error)));
  }

  revalidatePath(appsPath);
  redirect(withMessage(returnTo, "notice", active ? "Aplicación activada." : "Aplicación desactivada."));
}
