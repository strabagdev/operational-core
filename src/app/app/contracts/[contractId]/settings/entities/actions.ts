"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth-guards";
import {
  createEntityField,
  createEntityType,
  createFieldOption,
  friendlyActionError,
  getEntityFieldInput,
  getEntityTypeInput,
  getFieldOptionInput,
  setEntityFieldActive,
  setEntityTypeActive,
  setFieldOptionActive,
  updateEntityField,
  updateEntityType,
  updateFieldOption,
  reorderEntityFields,
} from "@/lib/entity-config";

async function requireUserId() {
  const user = await requireAuthenticatedUser();

  return user.id;
}

function entitiesPath(contractId: string, message?: string) {
  const path = `/app/contracts/${contractId}/settings/entities`;

  return message ? `${path}?error=${encodeURIComponent(message)}` : path;
}

function entityTypePath(
  contractId: string,
  entityTypeId: string,
  message?: string,
) {
  const path = `/app/contracts/${contractId}/settings/entities/${entityTypeId}`;

  return message ? `${path}?error=${encodeURIComponent(message)}` : path;
}

export async function createEntityTypeAction(
  contractId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let entityType: Awaited<ReturnType<typeof createEntityType>>;

  try {
    entityType = await createEntityType(
      contractId,
      userId,
      getEntityTypeInput(formData),
    );
  } catch (error) {
    redirect(entitiesPath(contractId, friendlyActionError(error)));
  }

  if (!entityType) {
    redirect(entitiesPath(contractId, "No tienes acceso a este contrato."));
  }

  revalidatePath(entitiesPath(contractId));
  redirect(entityTypePath(contractId, entityType.id));
}

export async function updateEntityTypeAction(
  contractId: string,
  entityTypeId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let entityType: Awaited<ReturnType<typeof updateEntityType>>;

  try {
    entityType = await updateEntityType(
      contractId,
      entityTypeId,
      userId,
      getEntityTypeInput(formData),
    );
  } catch (error) {
    redirect(entityTypePath(contractId, entityTypeId, friendlyActionError(error)));
  }

  if (!entityType) {
    redirect(entitiesPath(contractId, "No se encontró el tipo de entidad."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
}

export async function toggleEntityTypeAction(
  contractId: string,
  entityTypeId: string,
  isActive: boolean,
) {
  const userId = await requireUserId();

  await setEntityTypeActive(contractId, entityTypeId, userId, isActive);
  revalidatePath(entitiesPath(contractId));
  revalidatePath(entityTypePath(contractId, entityTypeId));
}

export async function createEntityFieldAction(
  contractId: string,
  entityTypeId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let field: Awaited<ReturnType<typeof createEntityField>>;

  try {
    field = await createEntityField(
      contractId,
      entityTypeId,
      userId,
      getEntityFieldInput(formData),
    );
  } catch (error) {
    redirect(entityTypePath(contractId, entityTypeId, friendlyActionError(error)));
  }

  if (!field) {
    redirect(entityTypePath(contractId, entityTypeId, "No se encontró el tipo de entidad."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
}

export async function updateEntityFieldAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let field: Awaited<ReturnType<typeof updateEntityField>>;

  try {
    field = await updateEntityField(
      contractId,
      entityTypeId,
      fieldId,
      userId,
      getEntityFieldInput(formData),
    );
  } catch (error) {
    redirect(entityTypePath(contractId, entityTypeId, friendlyActionError(error)));
  }

  if (!field) {
    redirect(entityTypePath(contractId, entityTypeId, "No se encontró el campo."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
}

export async function toggleEntityFieldAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  isActive: boolean,
) {
  const userId = await requireUserId();

  await setEntityFieldActive(contractId, entityTypeId, fieldId, userId, isActive);
  revalidatePath(entityTypePath(contractId, entityTypeId));
}

export async function reorderEntityFieldAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  direction: "up" | "down",
) {
  const userId = await requireUserId();

  await reorderEntityFields(contractId, entityTypeId, fieldId, userId, direction);
  revalidatePath(entityTypePath(contractId, entityTypeId));
}

export async function createFieldOptionAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let option: Awaited<ReturnType<typeof createFieldOption>>;

  try {
    option = await createFieldOption(
      contractId,
      entityTypeId,
      fieldId,
      userId,
      getFieldOptionInput(formData),
    );
  } catch (error) {
    redirect(entityTypePath(contractId, entityTypeId, friendlyActionError(error)));
  }

  if (!option) {
    redirect(entityTypePath(contractId, entityTypeId, "No se encontró el campo."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
}

export async function updateFieldOptionAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  optionId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let option: Awaited<ReturnType<typeof updateFieldOption>>;

  try {
    option = await updateFieldOption(
      contractId,
      entityTypeId,
      fieldId,
      optionId,
      userId,
      getFieldOptionInput(formData),
    );
  } catch (error) {
    redirect(entityTypePath(contractId, entityTypeId, friendlyActionError(error)));
  }

  if (!option) {
    redirect(entityTypePath(contractId, entityTypeId, "No se encontró la opción."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
}

export async function toggleFieldOptionAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  optionId: string,
  isActive: boolean,
) {
  const userId = await requireUserId();

  await setFieldOptionActive(
    contractId,
    entityTypeId,
    fieldId,
    optionId,
    userId,
    isActive,
  );
  revalidatePath(entityTypePath(contractId, entityTypeId));
}
