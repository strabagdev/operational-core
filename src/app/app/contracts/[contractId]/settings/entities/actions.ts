"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/auth-guards";
import { safeAppRedirectPath, withActionMessage } from "@/lib/action-redirects";
import {
  createEntityFieldWithOptions,
  createEntityField,
  createEntityType,
  createFieldOption,
  deleteUnusedEntityField,
  deleteUnusedFieldOption,
  FieldEditorInputError,
  friendlyActionError,
  getEntityFieldEditorInput,
  getEntityFieldInput,
  getEntityTypeInput,
  getFieldOptionInput,
  setEntityFieldActive,
  setEntityTypeActive,
  setFieldOptionActive,
  updateEntityField,
  updateEntityFieldWithOptions,
  updateEntityType,
  updateFieldOption,
  reorderEntityFields,
} from "@/lib/entity-config";
import { type FieldEditorActionState } from "@/lib/field-editor-state";
import { FieldValidationError } from "@/lib/field-validation";

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

function redirectPath(formData: FormData, key: "returnTo" | "successTo", fallback: string) {
  return safeAppRedirectPath(formData.get(key), fallback);
}

function withMessage(path: string, key: "error" | "notice", message: string) {
  return withActionMessage(path, key, message);
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
  const fallbackPath = entityTypePath(contractId, entityTypeId);
  const returnTo = redirectPath(formData, "returnTo", fallbackPath);
  const successTo = redirectPath(formData, "successTo", fallbackPath);

  try {
    field = await createEntityField(
      contractId,
      entityTypeId,
      userId,
      getEntityFieldInput(formData),
    );
  } catch (error) {
    redirect(withMessage(returnTo, "error", friendlyActionError(error)));
  }

  if (!field) {
    redirect(withMessage(returnTo, "error", "No se encontró el tipo de entidad."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
  redirect(withMessage(successTo, "notice", "Campo creado."));
}

export async function createEntityFieldEditorAction(
  contractId: string,
  entityTypeId: string,
  _previousState: FieldEditorActionState,
  formData: FormData,
): Promise<FieldEditorActionState> {
  const userId = await requireUserId();
  const fallbackPath = entityTypePath(contractId, entityTypeId);
  const successTo = redirectPath(formData, "successTo", fallbackPath);
  let field: Awaited<ReturnType<typeof createEntityFieldWithOptions>>;

  try {
    const input = getEntityFieldEditorInput(formData);
    field = await createEntityFieldWithOptions(
      contractId,
      entityTypeId,
      userId,
      input.field,
      input.options,
    );
  } catch (error) {
    return fieldEditorErrorState(error, formData, "No fue posible crear el campo.");
  }

  if (!field) {
    return {
      success: false,
      message: "No se encontró el tipo de entidad.",
      values: preserveFieldEditorValues(formData),
    };
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
  redirect(withMessage(successTo, "notice", "Campo creado correctamente."));
}

export async function updateEntityFieldAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let field: Awaited<ReturnType<typeof updateEntityField>>;
  const fallbackPath = entityTypePath(contractId, entityTypeId);
  const returnTo = redirectPath(formData, "returnTo", fallbackPath);
  const successTo = redirectPath(formData, "successTo", fallbackPath);

  try {
    field = await updateEntityField(
      contractId,
      entityTypeId,
      fieldId,
      userId,
      getEntityFieldInput(formData),
    );
  } catch (error) {
    redirect(withMessage(returnTo, "error", friendlyActionError(error)));
  }

  if (!field) {
    redirect(withMessage(returnTo, "error", "No se encontró el campo."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
  redirect(withMessage(successTo, "notice", "Cambios guardados."));
}

export async function updateEntityFieldEditorAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  _previousState: FieldEditorActionState,
  formData: FormData,
): Promise<FieldEditorActionState> {
  const userId = await requireUserId();
  const fallbackPath = entityTypePath(contractId, entityTypeId);
  const successTo = redirectPath(formData, "successTo", fallbackPath);
  let field: Awaited<ReturnType<typeof updateEntityFieldWithOptions>>;

  try {
    const input = getEntityFieldEditorInput(formData);
    field = await updateEntityFieldWithOptions(
      contractId,
      entityTypeId,
      fieldId,
      userId,
      input.field,
      input.options,
    );
  } catch (error) {
    return fieldEditorErrorState(error, formData, "No fue posible guardar el campo.");
  }

  if (!field) {
    return {
      success: false,
      message: "No se encontró el campo.",
      values: preserveFieldEditorValues(formData),
    };
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
  redirect(withMessage(successTo, "notice", "Cambios guardados."));
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

export async function toggleEntityFieldFromListAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  isActive: boolean,
  formData: FormData,
) {
  const userId = await requireUserId();
  const fallbackPath = entityTypePath(contractId, entityTypeId);
  const returnTo = redirectPath(formData, "returnTo", fallbackPath);

  try {
    await setEntityFieldActive(contractId, entityTypeId, fieldId, userId, isActive);
  } catch (error) {
    redirect(withMessage(returnTo, "error", friendlyActionError(error)));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
  redirect(
    withMessage(returnTo, "notice", isActive ? "Campo activado." : "Campo desactivado."),
  );
}

export async function deleteEntityFieldFromListAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  const fallbackPath = entityTypePath(contractId, entityTypeId);
  const returnTo = redirectPath(formData, "returnTo", fallbackPath);
  let deleted: Awaited<ReturnType<typeof deleteUnusedEntityField>>;

  try {
    deleted = await deleteUnusedEntityField(
      contractId,
      entityTypeId,
      fieldId,
      userId,
    );
  } catch (error) {
    redirect(withMessage(returnTo, "error", friendlyActionError(error)));
  }

  if (!deleted) {
    redirect(withMessage(returnTo, "error", "No se encontró el campo."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
  redirect(withMessage(returnTo, "notice", "Campo eliminado definitivamente."));
}

export async function reorderEntityFieldAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  direction: "up" | "down",
  formData: FormData,
) {
  const userId = await requireUserId();
  const fallbackPath = entityTypePath(contractId, entityTypeId);
  const returnTo = redirectPath(formData, "returnTo", fallbackPath);

  try {
    await reorderEntityFields(contractId, entityTypeId, fieldId, userId, direction);
  } catch (error) {
    redirect(withMessage(returnTo, "error", friendlyActionError(error)));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
  redirect(withMessage(returnTo, "notice", "Orden actualizado."));
}

export async function createFieldOptionAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let option: Awaited<ReturnType<typeof createFieldOption>>;
  const fallbackPath = entityTypePath(contractId, entityTypeId);
  const returnTo = redirectPath(formData, "returnTo", fallbackPath);

  try {
    option = await createFieldOption(
      contractId,
      entityTypeId,
      fieldId,
      userId,
      getFieldOptionInput(formData),
    );
  } catch (error) {
    redirect(withMessage(returnTo, "error", friendlyActionError(error)));
  }

  if (!option) {
    redirect(withMessage(returnTo, "error", "No se encontró el campo."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
  redirect(withMessage(returnTo, "notice", "Opción agregada."));
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
  const fallbackPath = entityTypePath(contractId, entityTypeId);
  const returnTo = redirectPath(formData, "returnTo", fallbackPath);

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
    redirect(withMessage(returnTo, "error", friendlyActionError(error)));
  }

  if (!option) {
    redirect(withMessage(returnTo, "error", "No se encontró la opción."));
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));
  redirect(withMessage(returnTo, "notice", "Opción guardada."));
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

export async function deleteFieldOptionAction(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  optionId: string,
): Promise<{ success: boolean; message: string }> {
  const userId = await requireUserId();

  try {
    const deleted = await deleteUnusedFieldOption(
      contractId,
      entityTypeId,
      fieldId,
      optionId,
      userId,
    );

    if (!deleted) {
      return { success: false, message: "No se encontró la opción." };
    }
  } catch (error) {
    return {
      success: false,
      message:
        friendlyActionError(error) === "No se pudo completar la operación."
          ? "No puedes eliminar esta opción porque está siendo utilizada."
          : friendlyActionError(error),
    };
  }

  revalidatePath(entityTypePath(contractId, entityTypeId));

  return { success: true, message: "Opción eliminada." };
}

function fieldEditorErrorState(
  error: unknown,
  formData: FormData,
  fallbackMessage: string,
): FieldEditorActionState {
  return {
    success: false,
    message: fieldEditorMessage(error, fallbackMessage),
    fieldErrors: fieldEditorFieldErrors(error),
    values: preserveFieldEditorValues(formData),
  };
}

function fieldEditorMessage(error: unknown, fallbackMessage: string) {
  const friendly = friendlyActionError(error);

  return friendly === "No se pudo completar la operación." ? fallbackMessage : friendly;
}

function fieldEditorFieldErrors(error: unknown) {
  if (error instanceof FieldEditorInputError || error instanceof FieldValidationError) {
    return error.fieldErrors;
  }

  if (error instanceof z.ZodError) {
    return Object.fromEntries(
      error.issues.map((issue) => [
        issue.path.join(".") || "form",
        [issue.message],
      ]),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(", ")
      : "";

    if (target.includes("key")) {
      return { key: ["Este identificador ya está en uso."] };
    }

    if (target.includes("value")) {
      return { options: ["Hay valores internos repetidos."] };
    }
  }

  if (error instanceof Error && error.name === "UserFacingError") {
    if (error.message.includes("Campo principal") || error.message.includes("primary")) {
      return { displayPrimary: [error.message] };
    }

    if (error.message.includes("relacionada") || error.message.includes("Relación")) {
      return { targetEntityTypeId: [error.message] };
    }

    if (error.message.includes("tipo")) {
      return { type: [error.message] };
    }
  }

  return undefined;
}

function preserveFieldEditorValues(formData: FormData) {
  const values: FieldEditorActionState["values"] = {};

  for (const [key, value] of formData.entries()) {
    if (key === "returnTo" || key === "successTo") {
      continue;
    }

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
