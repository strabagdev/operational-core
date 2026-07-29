"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth-guards";
import { friendlyActionError } from "@/lib/entity-config";
import {
  archiveEntityRecord,
  createEntityRecord,
  restoreEntityRecord,
  FieldValidationError,
  updateEntityRecord,
} from "@/lib/entity-records";

async function requireUserId() {
  const user = await requireAuthenticatedUser();

  return user.id;
}

function recordsPath(
  contractId: string,
  entityTypeId?: string,
  message?: string,
  fieldErrors?: Record<string, string[]>,
) {
  const path = entityTypeId
    ? `/app/contracts/${contractId}/records/${entityTypeId}`
    : `/app/contracts/${contractId}/records`;
  const params = new URLSearchParams();

  if (message) {
    params.set("error", message);
  }

  if (fieldErrors) {
    params.set("fieldErrors", JSON.stringify(fieldErrors));
  }

  const query = params.toString();

  return query ? `${path}?${query}` : path;
}

function recordPath(
  contractId: string,
  entityTypeId: string,
  recordId: string,
  message?: string,
  fieldErrors?: Record<string, string[]>,
) {
  const path = `/app/contracts/${contractId}/records/${entityTypeId}/${recordId}`;
  const params = new URLSearchParams();

  if (message) {
    params.set("error", message);
  }

  if (fieldErrors) {
    params.set("fieldErrors", JSON.stringify(fieldErrors));
  }

  const query = params.toString();

  return query ? `${path}?${query}` : path;
}

export async function createEntityRecordAction(
  contractId: string,
  entityTypeId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let record: Awaited<ReturnType<typeof createEntityRecord>>;

  try {
    record = await createEntityRecord(contractId, entityTypeId, userId, formData);
  } catch (error) {
    redirect(
      recordsPath(
        contractId,
        entityTypeId,
        friendlyActionError(error),
        error instanceof FieldValidationError ? error.fieldErrors : undefined,
      ),
    );
  }

  if (!record) {
    redirect(recordsPath(contractId, entityTypeId, "No se encontró el tipo de entidad."));
  }

  revalidatePath(recordsPath(contractId));
  revalidatePath(recordsPath(contractId, entityTypeId));
  redirect(recordPath(contractId, entityTypeId, record.id));
}

export async function updateEntityRecordAction(
  contractId: string,
  entityTypeId: string,
  recordId: string,
  formData: FormData,
) {
  const userId = await requireUserId();
  let record: Awaited<ReturnType<typeof updateEntityRecord>>;

  try {
    record = await updateEntityRecord(
      contractId,
      entityTypeId,
      recordId,
      userId,
      formData,
    );
  } catch (error) {
    redirect(
      recordPath(
        contractId,
        entityTypeId,
        recordId,
        friendlyActionError(error),
        error instanceof FieldValidationError ? error.fieldErrors : undefined,
      ),
    );
  }

  if (!record) {
    redirect(recordsPath(contractId, entityTypeId, "No se encontró el registro."));
  }

  revalidatePath(recordsPath(contractId));
  revalidatePath(recordsPath(contractId, entityTypeId));
  revalidatePath(recordPath(contractId, entityTypeId, recordId));
}

export async function archiveEntityRecordAction(
  contractId: string,
  entityTypeId: string,
  recordId: string,
) {
  const userId = await requireUserId();

  await archiveEntityRecord(contractId, entityTypeId, recordId, userId);
  revalidatePath(recordsPath(contractId));
  revalidatePath(recordsPath(contractId, entityTypeId));
}

export async function restoreEntityRecordAction(
  contractId: string,
  entityTypeId: string,
  recordId: string,
) {
  const userId = await requireUserId();

  await restoreEntityRecord(contractId, entityTypeId, recordId, userId);
  revalidatePath(recordsPath(contractId));
  revalidatePath(recordsPath(contractId, entityTypeId));
}
