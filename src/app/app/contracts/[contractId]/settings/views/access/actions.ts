"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withActionMessage } from "@/lib/action-redirects";
import {
  appViewAccessFriendlyError,
  getAppViewAccessInput,
  updateUserAppViewAccess,
} from "@/lib/app-view-access";
import { requireAuthenticatedUser } from "@/lib/auth-guards";

async function requireUserId() {
  const user = await requireAuthenticatedUser();

  return user.id;
}

function accessPath(contractId: string, userId?: string) {
  const path = `/app/contracts/${contractId}/settings/views/access`;

  return userId ? `${path}?userId=${encodeURIComponent(userId)}` : path;
}

export async function updateAppViewAccessAction(formData: FormData) {
  const adminUserId = await requireUserId();
  const input = getAppViewAccessInput(formData);
  const returnPath = accessPath(input.contractId, input.targetUserId);

  try {
    const result = await updateUserAppViewAccess({ adminUserId, input });

    if (!result) {
      redirect(withActionMessage(returnPath, "error", "No tienes permiso para administrar asignaciones."));
    }
  } catch (error) {
    redirect(withActionMessage(returnPath, "error", appViewAccessFriendlyError(error)));
  }

  revalidatePath(accessPath(input.contractId));
  redirect(withActionMessage(returnPath, "notice", "Asignaciones guardadas."));
}
