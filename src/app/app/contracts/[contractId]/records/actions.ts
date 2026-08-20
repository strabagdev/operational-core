"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth-guards";
import { friendlyActionError } from "@/lib/entity-config";
import {
  EntityImportValidationError,
  EntityImportUserError,
  friendlyImportPersistenceError,
  getEntityImportContext,
  getExistingUniqueValuesByRecord,
  importEntityRecords,
  validateImportFile,
  type EntityImportError,
} from "@/lib/entity-import";
import {
  createEntityRecord,
  deleteEntityRecordsPermanently,
  FieldValidationError,
  updateEntityRecord,
} from "@/lib/entity-records";

export type ImportEntityRecordsActionState = {
  status: "idle" | "valid" | "error" | "success";
  message?: string;
  rowsRead?: number;
  validRows?: number;
  errorRows?: number;
  errors?: EntityImportError[];
  importedCount?: number;
  createdCount?: number;
  updatedCount?: number;
  changeCount?: number;
};

async function requireUserId() {
  const user = await requireAuthenticatedUser();

  return user.id;
}

function recordsPath(
  contractId: string,
  entityTypeId?: string,
  options: {
    message?: string;
    fieldErrors?: Record<string, string[]>;
    formValues?: Record<string, string[]>;
  } = {},
) {
  const path = entityTypeId
    ? `/app/contracts/${contractId}/records/${entityTypeId}`
    : `/app/contracts/${contractId}/records`;
  const params = new URLSearchParams();

  if (options.message) {
    params.set("error", options.message);
  }

  if (options.fieldErrors) {
    params.set("fieldErrors", JSON.stringify(options.fieldErrors));
  }

  if (options.formValues) {
    params.set("formValues", JSON.stringify(options.formValues));
  }

  const query = params.toString();

  return query ? `${path}?${query}` : path;
}

function newRecordPath(
  contractId: string,
  entityTypeId: string,
  options: {
    message?: string;
    fieldErrors?: Record<string, string[]>;
    formValues?: Record<string, string[]>;
  } = {},
) {
  const path = `/app/contracts/${contractId}/records/${entityTypeId}/new`;
  const params = new URLSearchParams();

  if (options.message) {
    params.set("error", options.message);
  }

  if (options.fieldErrors) {
    params.set("fieldErrors", JSON.stringify(options.fieldErrors));
  }

  if (options.formValues) {
    params.set("formValues", JSON.stringify(options.formValues));
  }

  const query = params.toString();

  return query ? `${path}?${query}` : path;
}

function recordPath(
  contractId: string,
  entityTypeId: string,
  recordId: string,
  options: {
    edit?: boolean;
    message?: string;
    notice?: string;
    fieldErrors?: Record<string, string[]>;
    formValues?: Record<string, string[]>;
  } = {},
) {
  const path = `/app/contracts/${contractId}/records/${entityTypeId}/${recordId}`;
  const params = new URLSearchParams();

  if (options.edit) {
    params.set("edit", "1");
  }

  if (options.message) {
    params.set("error", options.message);
  }

  if (options.notice) {
    params.set("notice", options.notice);
  }

  if (options.fieldErrors) {
    params.set("fieldErrors", JSON.stringify(options.fieldErrors));
  }

  if (options.formValues) {
    params.set("formValues", JSON.stringify(options.formValues));
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
      newRecordPath(
        contractId,
        entityTypeId,
        {
          message: friendlyActionError(error),
          fieldErrors: error instanceof FieldValidationError ? error.fieldErrors : undefined,
          formValues: serializeRecordFormValues(formData),
        },
      ),
    );
  }

  if (!record) {
    redirect(recordsPath(contractId, entityTypeId, { message: "No se encontró el tipo de entidad." }));
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
        {
          edit: true,
          message: friendlyActionError(error),
          fieldErrors: error instanceof FieldValidationError ? error.fieldErrors : undefined,
          formValues: serializeRecordFormValues(formData),
        },
      ),
    );
  }

  if (!record) {
    redirect(recordsPath(contractId, entityTypeId, { message: "No se encontró el registro." }));
  }

  revalidatePath(recordsPath(contractId));
  revalidatePath(recordsPath(contractId, entityTypeId));
  revalidatePath(recordPath(contractId, entityTypeId, recordId));
  redirect(recordPath(contractId, entityTypeId, recordId, { notice: "Cambios guardados." }));
}

export type BulkEntityRecordsActionState = {
  success: boolean;
  message: string;
};

export async function deleteEntityRecordsAction(
  contractId: string,
  entityTypeId: string,
  formData: FormData,
): Promise<BulkEntityRecordsActionState> {
  const userId = await requireUserId();

  try {
    const result = await deleteEntityRecordsPermanently(
      contractId,
      entityTypeId,
      selectedRecordIds(formData),
      userId,
      String(formData.get("confirmation") ?? ""),
    );

    if (!result) {
      return { success: false, message: "No se encontró el tipo de entidad." };
    }

    revalidatePath(recordsPath(contractId));
    revalidatePath(recordsPath(contractId, entityTypeId));

    return { success: true, message: `${result.count} registros eliminados permanentemente.` };
  } catch (error) {
    return { success: false, message: friendlyActionError(error) };
  }
}

function selectedRecordIds(formData: FormData) {
  return formData
    .getAll("recordId")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function serializeRecordFormValues(formData: FormData) {
  const values: Record<string, string[]> = {};

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("field_")) {
      continue;
    }

    const fieldId = key.slice("field_".length);
    values[fieldId] = [...(values[fieldId] ?? []), String(value)];
  }

  return values;
}

export async function importEntityRecordsAction(
  contractId: string,
  entityTypeId: string,
  _previousState: ImportEntityRecordsActionState,
  formData: FormData,
): Promise<ImportEntityRecordsActionState> {
  const userId = await requireUserId();
  const file = formData.get("file");
  const intent = formData.get("intent") === "import" ? "import" : "validate";

  if (!(file instanceof File) || file.size === 0) {
    return {
      status: "error",
      message: "Selecciona una plantilla Excel descargada desde esta entidad.",
    };
  }

  try {
    if (intent === "validate") {
      const context = await getEntityImportContext(contractId, entityTypeId, userId);

      if (!context) {
        return { status: "error", message: "No se encontró el tipo de entidad." };
      }

      const result = await validateImportFile({
        contractId: context.contract.id,
        entityTypeId: context.entityType.id,
        fields: context.importableFields,
        file,
        existingUniqueValues: (field) => getExistingUniqueValuesByRecord(context.entityType.id, field),
      });

      return {
        status: result.success ? "valid" : "error",
        rowsRead: result.rowsRead,
        validRows: result.validRows,
        createdCount: result.createRows,
        updatedCount: result.updateRows,
        changeCount: result.changeCount,
        errorRows: result.errorRows,
        errors: result.errors,
        message: result.success
          ? "Archivo validado correctamente."
          : "Corrige los errores antes de importar.",
      };
    }

    const result = await importEntityRecords({ contractId, entityTypeId, userId, file });

    if (!result) {
      return { status: "error", message: "No se encontró el tipo de entidad." };
    }

    revalidatePath(recordsPath(contractId));
    revalidatePath(recordsPath(contractId, entityTypeId));

    return {
      status: "success",
      importedCount: result.importedCount,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      rowsRead: result.importedCount,
      validRows: result.importedCount,
      errorRows: 0,
      errors: [],
      message: importSuccessMessage(result.createdCount, result.updatedCount),
    };
  } catch (error) {
    if (error instanceof EntityImportUserError) {
      return { status: "error", message: error.message };
    }

    if (error instanceof EntityImportValidationError) {
      return {
        status: "error",
        message: "Corrige los errores antes de importar.",
        errors: error.errors,
        errorRows: new Set(error.errors.map((item) => item.row)).size,
      };
    }

    return {
      status: "error",
      message: friendlyImportPersistenceError(error),
    };
  }
}

function importSuccessMessage(createdCount: number, updatedCount: number) {
  if (createdCount > 0 && updatedCount > 0) {
    return `${createdCount} registros creados y ${updatedCount} actualizados correctamente.`;
  }

  if (updatedCount > 0) {
    return `${updatedCount} registros actualizados correctamente.`;
  }

  return `${createdCount} registros importados correctamente.`;
}
