"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MembershipRole } from "@prisma/client";

import { safeAppRedirectPath, withActionMessage } from "@/lib/action-redirects";
import { requireAuthenticatedUser } from "@/lib/auth-guards";
import {
  addUserToOrganization,
  getUserFormInput,
  removeMembershipForAdmin,
  updateMembershipRoleForAdmin,
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

export async function addUserAction(formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");
  let notice = "Usuario agregado.";

  try {
    const result = await addUserToOrganization(userId, getUserFormInput(formData));
    notice = result.existingUser
      ? "Este usuario ya existe. Se agregará a esta organización."
      : notice;
  } catch (error) {
    redirect(withMessage(returnTo, "error", userAdminFriendlyError(error)));
  }

  revalidatePath(usersPath);
  redirect(withMessage(successTo, "notice", notice));
}

export async function updateMembershipRoleAction(
  membershipId: string,
  role: MembershipRole,
  formData: FormData,
) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");

  try {
    const membership = await updateMembershipRoleForAdmin({
      adminUserId: userId,
      membershipId,
      role,
    });

    if (!membership) {
      redirect(withMessage(returnTo, "error", "No se encontró la membresía."));
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", userAdminFriendlyError(error)));
  }

  revalidatePath(usersPath);
  redirect(withMessage(returnTo, "notice", "Rol actualizado."));
}

export async function removeMembershipAction(membershipId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");

  try {
    const membership = await removeMembershipForAdmin({
      adminUserId: userId,
      membershipId,
    });

    if (!membership) {
      redirect(withMessage(returnTo, "error", "No se encontró la membresía."));
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", userAdminFriendlyError(error)));
  }

  revalidatePath(usersPath);
  revalidatePath("/app");
  redirect(withMessage(returnTo, "notice", "Usuario quitado de la organización."));
}
