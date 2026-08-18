"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { safeAppRedirectPath, withActionMessage } from "@/lib/action-redirects";
import { requireAuthenticatedUser } from "@/lib/auth-guards";
import {
  createUserForAdmin,
  deleteUserForAdmin,
  getAppViewAccessInputForUser,
  getCreateUserFormInput,
  getDeleteUserConfirmation,
  getUpdateUserFormInput,
  isPrismaConnectivityError,
  isUserAdminDatabaseConnectionError,
  setUserActiveForAdmin,
  updateUserExperiencesForAdmin,
  updateUserForAdmin,
  userAdminFriendlyError,
} from "@/lib/user-admin";

const usersPath = "/app/settings/users";

async function requireUserId() {
  const user = await requireAuthenticatedUser();

  return user.id;
}

function redirectPath(formData: FormData, key: "returnTo" | "successTo") {
  return safeAppRedirectPath(formData.get(key), usersPath);
}

function withMessage(path: string, key: "error" | "notice", message: string) {
  return withActionMessage(path, key, message);
}

function logUserAdminActionError(action: string, error: unknown) {
  if (isUserAdminDatabaseConnectionError(error) || isPrismaConnectivityError(error)) {
    console.error(`[user-admin] ${action} failed with database connectivity error.`, error);
  }
}

export async function createUserAction(formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");

  try {
    await createUserForAdmin(userId, getCreateUserFormInput(formData));
  } catch (error) {
    logUserAdminActionError("createUserAction", error);
    redirect(withMessage(returnTo, "error", userAdminFriendlyError(error)));
  }

  revalidatePath(usersPath);
  redirect(withMessage(successTo, "notice", "Usuario creado."));
}

export async function updateUserAction(targetUserId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");

  try {
    const result = await updateUserForAdmin({
      adminUserId: userId,
      input: getUpdateUserFormInput(formData),
      userId: targetUserId,
    });

    if (!result) {
      redirect(withMessage(returnTo, "error", "No se encontró el usuario."));
    }
  } catch (error) {
    logUserAdminActionError("updateUserAction", error);
    redirect(withMessage(returnTo, "error", userAdminFriendlyError(error)));
  }

  revalidatePath(usersPath);
  revalidatePath(`${usersPath}/${targetUserId}`);
  redirect(withMessage(successTo, "notice", "Usuario actualizado."));
}

export async function setUserActiveAction(
  targetUserId: string,
  active: boolean,
  formData: FormData,
) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");

  try {
    const result = await setUserActiveForAdmin({
      active,
      adminUserId: userId,
      userId: targetUserId,
    });

    if (!result) {
      redirect(withMessage(returnTo, "error", "No se encontró el usuario."));
    }
  } catch (error) {
    logUserAdminActionError("setUserActiveAction", error);
    redirect(withMessage(returnTo, "error", userAdminFriendlyError(error)));
  }

  revalidatePath(usersPath);
  revalidatePath(`${usersPath}/${targetUserId}`);
  redirect(withMessage(returnTo, "notice", active ? "Usuario activado." : "Usuario desactivado."));
}

export async function updateUserExperiencesAction(targetUserId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const { appViewIds, contractId } = getAppViewAccessInputForUser(formData);

  try {
    const result = await updateUserExperiencesForAdmin({
      adminUserId: userId,
      appViewIds,
      contractId,
      targetUserId,
    });

    if (!result) {
      redirect(withMessage(returnTo, "error", "No tienes permiso para administrar asignaciones."));
    }
  } catch (error) {
    logUserAdminActionError("updateUserExperiencesAction", error);
    redirect(withMessage(returnTo, "error", userAdminFriendlyError(error)));
  }

  revalidatePath(usersPath);
  revalidatePath(`${usersPath}/${targetUserId}`);
  redirect(withMessage(returnTo, "notice", "Experiencias actualizadas."));
}

export async function deleteUserAction(targetUserId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");

  try {
    const result = await deleteUserForAdmin({
      adminUserId: userId,
      confirmationText: getDeleteUserConfirmation(formData),
      userId: targetUserId,
    });

    if (!result) {
      redirect(withMessage(returnTo, "error", "No se encontró el usuario."));
    }
  } catch (error) {
    logUserAdminActionError("deleteUserAction", error);
    redirect(withMessage(returnTo, "error", userAdminFriendlyError(error)));
  }

  revalidatePath(usersPath);
  redirect(withMessage(successTo, "notice", "Usuario eliminado permanentemente."));
}
