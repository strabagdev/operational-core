"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth-guards";
import { safeAppRedirectPath, withActionMessage } from "@/lib/action-redirects";
import {
  archiveContractForAdmin,
  contractAdminFriendlyError,
  createContractForAdmin,
  deleteContractForAdmin,
  getContractFormInput,
  restoreContractForAdmin,
  updateContractForAdmin,
} from "@/lib/contract-admin";

const contractsPath = "/app/settings/contracts";

async function requireUserId() {
  const user = await requireAuthenticatedUser();

  return user.id;
}

function redirectPath(formData: FormData, key: "returnTo" | "successTo") {
  return safeAppRedirectPath(formData.get(key), contractsPath);
}

function withMessage(path: string, key: "error" | "notice", message: string) {
  return withActionMessage(path, key, message);
}

export async function createContractAction(formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");

  try {
    await createContractForAdmin(userId, getContractFormInput(formData));
  } catch (error) {
    redirect(withMessage(returnTo, "error", contractAdminFriendlyError(error)));
  }

  revalidatePath(contractsPath);
  revalidatePath("/app");
  redirect(withMessage(successTo, "notice", "Contrato creado."));
}

export async function updateContractAction(contractId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");

  try {
    const contract = await updateContractForAdmin(userId, contractId, getContractFormInput(formData));

    if (!contract) {
      redirect(withMessage(returnTo, "error", "No se encontró el contrato."));
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", contractAdminFriendlyError(error)));
  }

  revalidatePath(contractsPath);
  revalidatePath("/app");
  redirect(withMessage(successTo, "notice", "Cambios guardados."));
}

export async function archiveContractAction(contractId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");

  try {
    const contract = await archiveContractForAdmin(userId, contractId);

    if (!contract) {
      redirect(withMessage(returnTo, "error", "No se encontró el contrato."));
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", contractAdminFriendlyError(error)));
  }

  revalidatePath(contractsPath);
  revalidatePath("/app");
  redirect(withMessage(successTo, "notice", "Contrato archivado."));
}

export async function restoreContractAction(contractId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");

  try {
    const contract = await restoreContractForAdmin(userId, contractId);

    if (!contract) {
      redirect(withMessage(returnTo, "error", "No se encontró el contrato."));
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", contractAdminFriendlyError(error)));
  }

  revalidatePath(contractsPath);
  revalidatePath("/app");
  redirect(withMessage(returnTo, "notice", "Contrato restaurado."));
}

export async function deleteContractAction(contractId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");
  const confirmationText = String(formData.get("confirmationText") ?? "");

  try {
    const contract = await deleteContractForAdmin(userId, contractId, confirmationText);

    if (!contract) {
      redirect(withMessage(returnTo, "error", "No se encontró el contrato."));
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", contractAdminFriendlyError(error)));
  }

  revalidatePath(contractsPath);
  revalidatePath("/app");
  redirect(withMessage(successTo, "notice", "Contrato eliminado permanentemente."));
}
