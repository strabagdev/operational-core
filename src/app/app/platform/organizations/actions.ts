"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { safeAppRedirectPath, withActionMessage } from "@/lib/action-redirects";
import { requireAuthenticatedUser } from "@/lib/auth-guards";
import {
  createOrganizationWithInitialAdmin,
  getCreateOrganizationFormInput,
  getOrganizationFormInput,
  platformOrganizationAdminFriendlyError,
  PlatformOrganizationAdminError,
  setOrganizationActive,
  updateOrganization,
} from "@/lib/platform-organization-admin";

const organizationsPath = "/app/platform/organizations";

async function requireUserId() {
  const user = await requireAuthenticatedUser();

  return user.id;
}

function redirectPath(formData: FormData, key: "returnTo" | "successTo") {
  return safeAppRedirectPath(formData.get(key), organizationsPath);
}

function withMessage(path: string, key: "error" | "notice", message: string) {
  return withActionMessage(path, key, message);
}

export async function createOrganizationAction(formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");
  let createdOrganizationId: string;

  try {
    const result = await createOrganizationWithInitialAdmin(
      userId,
      getCreateOrganizationFormInput(formData),
    );

    createdOrganizationId = result.organization.id;
  } catch (error) {
    redirect(withMessage(returnTo, "error", platformOrganizationAdminFriendlyError(error)));
  }

  revalidatePath(organizationsPath);
  redirect(withMessage(successTo || `${organizationsPath}/${createdOrganizationId}`, "notice", "Organización creada."));
}

export async function updateOrganizationAction(organizationId: string, formData: FormData) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");
  const successTo = redirectPath(formData, "successTo");

  try {
    const organization = await updateOrganization(
      userId,
      organizationId,
      getOrganizationFormInput(formData),
    );

    if (!organization) {
      throw new PlatformOrganizationAdminError("No se encontró la organización.");
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", platformOrganizationAdminFriendlyError(error)));
  }

  revalidatePath(organizationsPath);
  revalidatePath(`${organizationsPath}/${organizationId}`);
  redirect(withMessage(successTo, "notice", "Organización actualizada."));
}

export async function setOrganizationActiveAction(
  organizationId: string,
  active: boolean,
  formData: FormData,
) {
  const userId = await requireUserId();
  const returnTo = redirectPath(formData, "returnTo");

  try {
    const organization = await setOrganizationActive(userId, organizationId, active);

    if (!organization) {
      throw new PlatformOrganizationAdminError("No se encontró la organización.");
    }
  } catch (error) {
    redirect(withMessage(returnTo, "error", platformOrganizationAdminFriendlyError(error)));
  }

  revalidatePath(organizationsPath);
  revalidatePath(`${organizationsPath}/${organizationId}`);
  revalidatePath("/app");
  redirect(withMessage(returnTo, "notice", active ? "Organización activada." : "Organización desactivada."));
}
