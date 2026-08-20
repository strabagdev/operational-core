import ExcelJS from "exceljs";
import { Prisma, type EntityField, type EntityFieldType } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { buildValueChanges } from "./audit";
import { dateOnlyInputValue, dateOnlyToUtcDate } from "./date-only";
import {
  getEntityRecordIdsForSort,
  deserializeEntityValue,
  getAuthorizedRecordEntityType,
  getRecordListFields,
} from "./entity-records";
import {
  FieldValidationError,
  fieldInputName,
  getRelationConfig,
  getRecordDisplayName,
  isEmptySerializedValue,
  validateRelationInputs,
  validateRecordValues,
  type RelationInput,
  type SerializedFieldValue,
} from "./field-validation";
import { orderEntityFields } from "./entity-field-order";
import { prisma } from "./prisma";

export const ENTITY_IMPORT_LIMITS = {
  maxFileSizeBytes: 5 * 1024 * 1024,
  maxRows: 5000,
} as const;
export const RECORD_ID_HEADER = "__record_id";
export const RELATION_IMPORT_EXPORT_SEPARATOR = " | ";

export const importableFieldTypes = new Set<EntityFieldType>([
  "TEXT",
  "TEXTAREA",
  "EMAIL",
  "PHONE",
  "URL",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "TIME",
  "SELECT",
  "MULTISELECT",
  "RELATION",
]);

const structureErrorMessage =
  "La estructura del archivo no coincide con los campos actuales de esta entidad. Descarga una nueva plantilla e inténtalo nuevamente.";
type ImportField = EntityField & {
  options: Array<{
    id: string;
    label: string;
    value: string;
    sortOrder: number;
    isActive: boolean;
  }>;
};

export type EntityImportError = {
  row: number;
  field: string;
  message: string;
};

export type EntityImportValidationResult = {
  success: boolean;
  rowsRead: number;
  validRows: number;
  createRows: number;
  updateRows: number;
  changeCount?: number;
  errorRows: number;
  errors: EntityImportError[];
};

type ParsedImportRow = {
  rowNumber: number;
  recordId: string | null;
  valuesByHeader: Map<string, unknown>;
};

type ValidImportRow = {
  rowNumber: number;
  recordId?: string;
  values: SerializedFieldValue[];
  relations: RelationInput[];
  displayName: string;
};

type ImportPersistencePlan = {
  auditChanges: Prisma.AuditChangeCreateManyInput[];
  auditEvents: Prisma.AuditEventCreateManyInput[];
  records: Prisma.EntityRecordCreateManyInput[];
  relations: Prisma.EntityRelationCreateManyInput[];
  relationFieldIds: string[];
  values: Prisma.EntityValueCreateManyInput[];
  updatedRecords: Array<{ id: string; displayName: string }>;
  updatedRecordIds: string[];
};

type RelationTargetMatch = {
  id: string;
  displayName: string;
  entityTypeId: string;
};

export type RelationTargetLookup = (
  field: ImportField,
  displayNames: string[],
) => Promise<Map<string, RelationTargetMatch[]>>;

export class EntityImportUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityImportUserError";
  }
}

export class EntityImportValidationError extends Error {
  readonly errors: EntityImportError[];

  constructor(errors: EntityImportError[]) {
    super("Corrige los errores antes de importar.");
    this.name = "EntityImportValidationError";
    this.errors = errors;
  }
}

export function friendlyImportPersistenceError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return "Los datos cambiaron desde la validación. Vuelve a validar el archivo.";
    }

    if (error.code === "P2003") {
      return "No fue posible guardar los registros. No se importó ninguna fila.";
    }

    if (error.code === "P2028") {
      return "La importación tardó más de lo permitido. No se creó ningún registro.";
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "No fue posible conectar con la base de datos. No se importó ninguna fila.";
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return "No fue posible guardar los registros. No se importó ninguna fila.";
  }

  if (error instanceof Error && /timeout|timed out|Transaction already closed/i.test(error.message)) {
    return "La importación tardó más de lo permitido. No se creó ningún registro.";
  }

  return "No fue posible guardar los registros. No se importó ninguna fila.";
}

export async function getEntityImportContext(
  contractId: string,
  entityTypeId: string,
  userId: string,
) {
  const authorized = await getAuthorizedRecordEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  const fields = authorized.entityType.fields as ImportField[];

  assertEntityImportable(fields);

  return {
    ...authorized,
    importableFields: getImportableFields(fields),
  };
}

export function getImportableFields(fields: ImportField[]) {
  const activeImportable = orderEntityFields(
    fields.filter((field) => field.isActive && importableFieldTypes.has(field.type)),
  );

  assertNoDuplicateFieldNames(activeImportable);

  return activeImportable;
}

export function assertEntityImportable(fields: ImportField[]) {
  void fields;
}

export async function generateEntityTemplate({
  entityName,
  fields,
}: {
  entityName: string;
  fields: ImportField[];
}) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(toExcelSheetName(entityName));
  const headers = fields.map((field) => field.name);

  worksheet.addRow(headers);
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(headers.length, 1) },
  };

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };

  for (const [index, header] of headers.entries()) {
    worksheet.getColumn(index + 1).width = Math.min(Math.max(header.length + 4, 14), 36);
  }

  return workbook.xlsx.writeBuffer();
}

export async function generateEntityExport({
  contractId,
  entityTypeId,
  sort,
  query,
  userId,
}: {
  contractId: string;
  entityTypeId: string;
  sort?: {
    key?: string;
    direction?: string;
  };
  query?: string;
  userId: string;
}) {
  const context = await getEntityImportContext(contractId, entityTypeId, userId);

  if (!context) {
    return null;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(toExcelSheetName(context.entityType.name));
  const fields = context.importableFields;
  const headers = [RECORD_ID_HEADER, ...fields.map((field) => field.name)];
  const orderedIds = await getEntityRecordIdsForSort({
    entityTypeId: context.entityType.id,
    fields: context.entityType.fields,
    listFields: getRecordListFields(context.entityType.fields),
    query,
    sort,
  });
  const records = await prisma.entityRecord.findMany({
    where: {
      id: { in: orderedIds.ids },
      entityTypeId: context.entityType.id,
    },
    include: {
      outgoingRelations: {
        include: {
          targetRecord: {
            select: {
              displayName: true,
              entityTypeId: true,
              id: true,
            },
          },
        },
        orderBy: { targetRecord: { displayName: "asc" } },
      },
      values: {
        include: {
          entityField: {
            include: {
              options: {
                orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
              },
            },
          },
        },
      },
    },
  });
  const recordOrder = new Map(orderedIds.ids.map((id, index) => [id, index]));

  records.sort((first, second) => {
    return (recordOrder.get(first.id) ?? 0) - (recordOrder.get(second.id) ?? 0);
  });

  worksheet.addRow(headers);
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  worksheet.getRow(1).font = { bold: true };

  for (const record of records) {
    worksheet.addRow([
      record.id,
      ...fields.map((field) => {
        const value = record.values.find((item) => item.entityFieldId === field.id);
        const relationValue = (record.outgoingRelations ?? [])
          .filter((relation) => relation.sourceFieldId === field.id)
          .map((relation) => relation.targetRecord.displayName)
          .join(RELATION_IMPORT_EXPORT_SEPARATOR);

        return field.type === "RELATION" ? relationValue : value ? exportEntityValue(field, value) : "";
      }),
    ]);
  }

  for (const [index, header] of headers.entries()) {
    worksheet.getColumn(index + 1).width = Math.min(Math.max(header.length + 4, 14), 42);
  }

  return {
    buffer: await workbook.xlsx.writeBuffer(),
    count: records.length,
    entityName: context.entityType.name,
  };
}

export function exportFileName(entityName: string) {
  return templateFileName(entityName).replace("_plantilla.xlsx", "_datos.xlsx");
}

export function templateFileName(entityName: string) {
  const normalized = entityName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return `${normalized || "entidad"}_plantilla.xlsx`;
}

export async function validateImportFile({
  contractId,
  entityTypeId,
  fields,
  file,
  existingUniqueValues,
  existingRecords,
}: {
  contractId?: string;
  entityTypeId?: string;
  fields: ImportField[];
  file: File;
  existingUniqueValues?: ExistingUniqueValuesProvider;
  existingRecords?: ExistingRecord[];
}): Promise<EntityImportValidationResult> {
  const rows = await parseExcelRows({ fields, file });
  const recordsForValidation =
    existingRecords ?? (entityTypeId ? await getExistingImportRecords(entityTypeId, rows) : undefined);
  const validation = await validateImportRows({
    fields,
    rows,
    existingUniqueValues,
    existingRecords: recordsForValidation,
    relationTargetLookup: contractId
      ? (field, displayNames) => getRelationTargetsByDisplayName(contractId, field, displayNames)
      : undefined,
  });

  return {
    success: validation.errors.length === 0,
    rowsRead: rows.length,
    validRows: validation.validRows.length,
    createRows: validation.validRows.filter((row) => !row.recordId).length,
    updateRows: validation.validRows.filter((row) => row.recordId).length,
    changeCount: validation.changeCount,
    errorRows: new Set(validation.errors.map((error) => error.row)).size,
    errors: validation.errors,
  };
}

export async function importEntityRecords({
  contractId,
  entityTypeId,
  file,
  userId,
}: {
  contractId: string;
  entityTypeId: string;
  file: File;
  userId: string;
}) {
  const context = await getEntityImportContext(contractId, entityTypeId, userId);

  if (!context) {
    return null;
  }

  const rows = await parseExcelRows({ fields: context.importableFields, file });
  const existingRecords = await getExistingImportRecords(context.entityType.id, rows);
  const validation = await validateImportRows({
    fields: context.importableFields,
    rows,
    existingRecords,
    existingUniqueValues: (field) => getExistingUniqueValuesByRecord(context.entityType.id, field),
    relationTargetLookup: (field, displayNames) =>
      getRelationTargetsByDisplayName(context.contract.id, field, displayNames),
  });

  if (validation.errors.length > 0) {
    throw new EntityImportValidationError(validation.errors);
  }

  const plan = buildImportPersistencePlan({
    contractId: context.contract.id,
    entityTypeId: context.entityType.id,
    entityTypeName: context.entityType.name,
    fields: context.entityType.fields,
    existingRecords,
    rows: validation.validRows,
    userId,
  });

  return prisma.$transaction(async (tx) => {
    if (plan.updatedRecords.length > 0) {
      await updateRecordDisplayNames(tx, plan.updatedRecords);
    }

    if (plan.updatedRecordIds.length > 0) {
      await tx.entityValue.deleteMany({
        where: {
          entityRecordId: { in: plan.updatedRecordIds },
          entityFieldId: { in: context.importableFields.map((field) => field.id) },
        },
      });
    }

    if (plan.updatedRecordIds.length > 0 && plan.relationFieldIds.length > 0) {
      await tx.entityRelation.deleteMany({
        where: {
          sourceRecordId: { in: plan.updatedRecordIds },
          sourceFieldId: { in: plan.relationFieldIds },
        },
      });
    }

    if (plan.records.length > 0) {
      await tx.entityRecord.createMany({ data: plan.records });
    }

    if (plan.values.length > 0) {
      await tx.entityValue.createMany({ data: plan.values });
    }

    if (plan.relations.length > 0) {
      await tx.entityRelation.createMany({
        data: plan.relations,
        skipDuplicates: true,
      });
    }

    if (plan.auditEvents.length > 0) {
      await tx.auditEvent.createMany({ data: plan.auditEvents });
    }

    if (plan.auditChanges.length > 0) {
      await tx.auditChange.createMany({ data: plan.auditChanges });
    }

    return {
      importedCount: validation.validRows.length,
      createdCount: plan.records.length,
      updatedCount: plan.updatedRecordIds.length,
    };
  });
}

export function buildImportPersistencePlan({
  contractId,
  entityTypeId,
  entityTypeName,
  existingRecords = [],
  fields,
  rows,
  userId,
}: {
  contractId: string;
  entityTypeId: string;
  entityTypeName: string;
  existingRecords?: ExistingRecord[];
  fields: ImportField[];
  rows: ValidImportRow[];
  userId: string;
}): ImportPersistencePlan {
  const records: Prisma.EntityRecordCreateManyInput[] = [];
  const values: Prisma.EntityValueCreateManyInput[] = [];
  const relations: Prisma.EntityRelationCreateManyInput[] = [];
  const auditEvents: Prisma.AuditEventCreateManyInput[] = [];
  const auditChanges: Prisma.AuditChangeCreateManyInput[] = [];
  const updatedRecords: Array<{ id: string; displayName: string }> = [];
  const updatedRecordIds: string[] = [];
  const existingById = new Map(existingRecords.map((record) => [record.id, record]));
  const relationFieldIds = fields.filter((field) => field.type === "RELATION").map((field) => field.id);

  for (const row of rows) {
    const recordId = row.recordId ?? randomUUID();
    const auditEventId = randomUUID();
    const existingRecord = row.recordId ? existingById.get(row.recordId) : undefined;

    if (existingRecord) {
      updatedRecordIds.push(recordId);
      if (existingRecord.displayName !== row.displayName) {
        updatedRecords.push({ id: recordId, displayName: row.displayName });
      }
    } else {
      records.push({
        id: recordId,
        entityTypeId,
        displayName: row.displayName,
      });
    }

    for (const value of row.values.filter((item) => !isEmptySerializedValue(item))) {
      values.push({
        entityRecordId: recordId,
        entityFieldId: value.fieldId,
        textValue: value.textValue ?? null,
        integerValue: value.integerValue ?? null,
        decimalValue: value.decimalValue ?? null,
        booleanValue: value.booleanValue ?? null,
        dateValue: value.dateValue ?? null,
        jsonValue: value.jsonValue ?? Prisma.JsonNull,
      });
    }

    for (const relation of row.relations ?? []) {
      for (const targetRecordId of relation.targetRecordIds) {
        relations.push({
          sourceRecordId: recordId,
          sourceFieldId: relation.fieldId,
          targetRecordId,
        });
      }
    }

    const changes = buildValueChanges({
      fields,
      oldValues: existingRecord?.values ?? [],
      newValues: row.values,
    });

    if (existingRecord && changes.length === 0 && existingRecord.displayName === row.displayName) {
      continue;
    }

    auditEvents.push({
      id: auditEventId,
      contractId,
      entityTypeId,
      entityRecordId: recordId,
      actorUserId: userId,
      action: existingRecord ? "RECORD_UPDATED" : "RECORD_CREATED",
      summary: existingRecord
        ? `Actualizó ${entityTypeName} ${row.displayName} desde Excel`
        : `Importó ${entityTypeName} ${row.displayName}`,
      metadata: {
        displayName: row.displayName,
        entityTypeName,
        source: "excel_import",
      },
    });

    for (const change of changes) {
      auditChanges.push({
        auditEventId,
        entityFieldId: change.entityFieldId ?? null,
        fieldName: change.fieldName,
        oldValue: change.oldValue ?? Prisma.JsonNull,
        newValue: change.newValue ?? Prisma.JsonNull,
      });
    }
  }

  return {
    auditChanges,
    auditEvents,
    records,
    relationFieldIds,
    relations,
    updatedRecords,
    updatedRecordIds,
    values,
  };
}

export async function parseExcelRows({
  fields,
  file,
}: {
  fields: ImportField[];
  file: File;
}): Promise<ParsedImportRow[]> {
  assertExcelFile(file);

  const workbook = new ExcelJS.Workbook();

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new EntityImportUserError(
      "No fue posible leer el archivo. Verifica que sea una plantilla Excel válida.",
    );
  }

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new EntityImportUserError(structureErrorMessage);
  }

  const headerRow = worksheet.getRow(1);
  const headers = rowValues(headerRow).map(cellToHeader);
  const hasRecordId = validateHeaders(headers, fields);
  const fieldHeaders = hasRecordId ? headers.slice(1) : headers;

  const rows: ParsedImportRow[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = importRowValues({ fields, hasRecordId, headers, row });
    const recordId = hasRecordId ? String(values[0] ?? "").trim() : "";
    const fieldValues = hasRecordId ? values.slice(1) : values;

    if (values.every(isBlankCellValue)) {
      continue;
    }

    if (rows.length >= ENTITY_IMPORT_LIMITS.maxRows) {
      throw new EntityImportUserError(
        `Puedes importar hasta ${ENTITY_IMPORT_LIMITS.maxRows} filas por archivo.`,
      );
    }

    rows.push({
      rowNumber,
      recordId: recordId || null,
      valuesByHeader: new Map(fieldHeaders.map((header, index) => [header, fieldValues[index]])),
    });
  }

  return rows;
}

export type ExistingUniqueValuesProvider = (field: ImportField) => Promise<Map<string, string> | Set<string>>;

type ExistingRecord = {
  id: string;
  displayName: string;
  values: Array<{
    entityFieldId: string;
    textValue: string | null;
    integerValue: number | null;
    decimalValue: Prisma.Decimal | null;
    booleanValue: boolean | null;
    dateValue: Date | null;
    jsonValue: Prisma.JsonValue | null;
  }>;
};

export async function validateImportRows({
  fields,
  rows,
  existingUniqueValues,
  existingRecords,
  relationTargetLookup,
}: {
  fields: ImportField[];
  rows: ParsedImportRow[];
  existingUniqueValues?: ExistingUniqueValuesProvider;
  existingRecords?: ExistingRecord[];
  relationTargetLookup?: RelationTargetLookup;
}) {
  const errors: EntityImportError[] = [];
  const candidateRows: ValidImportRow[] = [];
  const existingById = new Map((existingRecords ?? []).map((record) => [record.id, record]));
  const seenRecordIds = new Set<string>();
  const relationTargets = await resolveImportRelationTargets({
    errors,
    fields,
    relationTargetLookup,
    rows,
  });

  for (const row of rows) {
    const formData = new FormData();
    const recordId = row.recordId?.trim() || undefined;

    if (recordId) {
      if (seenRecordIds.has(recordId)) {
        errors.push({
          row: row.rowNumber,
          field: RECORD_ID_HEADER,
          message: "El identificador de registro está duplicado dentro del archivo.",
        });
        continue;
      }

      seenRecordIds.add(recordId);

      if (!existingById.has(recordId)) {
        errors.push({
          row: row.rowNumber,
          field: RECORD_ID_HEADER,
          message: "El registro indicado ya no existe.",
        });
        continue;
      }
    }

    try {
      for (const field of fields) {
        if (field.type === "RELATION") {
          continue;
        }

        for (const value of excelValueToFormValues(field, row.valuesByHeader.get(field.name))) {
          formData.append(fieldInputName(field.id), value);
        }
      }
    } catch (error) {
      if (error instanceof FieldValidationError) {
        for (const [fieldId, messages] of Object.entries(error.fieldErrors)) {
          const field = fields.find((item) => item.id === fieldId);
          for (const message of messages) {
            errors.push({
              row: row.rowNumber,
              field: field?.name ?? "Archivo",
              message,
            });
          }
        }
        continue;
      }

      throw error;
    }

    let values: SerializedFieldValue[];
    let relations: RelationInput[];

    try {
      appendResolvedRelationValues({
        errors,
        fieldTargets: relationTargets,
        fields,
        formData,
        row,
      });
      values = validateRecordValues({ fields, formData, mode: recordId ? "edit" : "create" });
      relations = validateRelationInputs({ fields, formData });
    } catch (error) {
      if (error instanceof FieldValidationError) {
        for (const [fieldId, messages] of Object.entries(error.fieldErrors)) {
          const field = fields.find((item) => item.id === fieldId);
          for (const message of messages) {
            errors.push({
              row: row.rowNumber,
              field: field?.name ?? "Archivo",
              message,
            });
          }
        }
        continue;
      }

      throw error;
    }

    if (!errors.some((error) => error.row === row.rowNumber)) {
      candidateRows.push({
        rowNumber: row.rowNumber,
        recordId,
        values,
        relations,
        displayName: getRecordDisplayName(fields, values),
      });
    }
  }

  await validateUniqueImportRows({
    errors,
    existingUniqueValues,
    fields,
    rows: candidateRows,
  });

  const validRows = candidateRows.filter(
    (row) => !errors.some((error) => error.row === row.rowNumber),
  );
  const changeCount = validRows.reduce((count, row) => {
    const existingRecord = row.recordId ? existingById.get(row.recordId) : undefined;

    if (!existingRecord) {
      return count;
    }

    return count + buildValueChanges({
      fields,
      oldValues: existingRecord.values,
      newValues: row.values,
    }).length;
  }, 0);

  return { changeCount, errors, validRows };
}

async function validateUniqueImportRows({
  errors,
  existingUniqueValues,
  fields,
  rows,
}: {
  errors: EntityImportError[];
  existingUniqueValues?: ExistingUniqueValuesProvider;
  fields: ImportField[];
  rows: ValidImportRow[];
}) {
  const updatedRecordIds = new Set(rows.map((row) => row.recordId).filter(Boolean));

  for (const field of fields.filter((item) => item.isUnique)) {
    const seen = new Map<string, ValidImportRow>();
    const existingBySignature = existingUniqueValues
      ? normalizeExistingUniqueValues(await existingUniqueValues(field))
      : new Map<string, string>();

    for (const row of rows) {
      const value = row.values.find((item) => item.fieldId === field.id);

      if (!value || isEmptySerializedValue(value)) {
        continue;
      }

      const signature = uniqueValueSignature(value);
      const previous = seen.get(signature);

      if (previous) {
        errors.push({
          row: row.rowNumber,
          field: field.name,
          message: "Este valor está duplicado dentro del archivo.",
        });
        continue;
      }

      seen.set(signature, row);

      const ownerRecordId = existingBySignature.get(signature);

      if (
        ownerRecordId &&
        ownerRecordId !== row.recordId &&
        !updatedRecordIds.has(ownerRecordId)
      ) {
        errors.push({
          row: row.rowNumber,
          field: field.name,
          message: "Este valor ya existe.",
        });
      }
    }
  }
}

function normalizeExistingUniqueValues(values: Map<string, string> | Set<string>) {
  if (values instanceof Map) {
    return values;
  }

  return new Map(Array.from(values).map((signature) => [signature, "__external__"]));
}

type ResolvedRelationTargetsByField = Map<string, Map<string, RelationTargetMatch[]>>;

async function resolveImportRelationTargets({
  errors,
  fields,
  relationTargetLookup,
  rows,
}: {
  errors: EntityImportError[];
  fields: ImportField[];
  relationTargetLookup?: RelationTargetLookup;
  rows: ParsedImportRow[];
}): Promise<ResolvedRelationTargetsByField> {
  const relationFields = fields.filter((field) => field.type === "RELATION");
  const targetsByField = new Map<string, Map<string, RelationTargetMatch[]>>();

  for (const field of relationFields) {
    const displayNames = Array.from(
      new Set(
        rows.flatMap((row) =>
          relationDisplayNamesFromCell(row.valuesByHeader.get(field.name)),
        ),
      ),
    );

    if (displayNames.length === 0) {
      targetsByField.set(field.id, new Map());
      continue;
    }

    if (!relationTargetLookup) {
      for (const row of rows) {
        if (relationDisplayNamesFromCell(row.valuesByHeader.get(field.name)).length > 0) {
          errors.push({
            row: row.rowNumber,
            field: field.name,
            message: "No fue posible resolver registros relacionados para este campo.",
          });
        }
      }
      targetsByField.set(field.id, new Map());
      continue;
    }

    targetsByField.set(field.id, await relationTargetLookup(field, displayNames));
  }

  return targetsByField;
}

function appendResolvedRelationValues({
  errors,
  fieldTargets,
  fields,
  formData,
  row,
}: {
  errors: EntityImportError[];
  fieldTargets: ResolvedRelationTargetsByField;
  fields: ImportField[];
  formData: FormData;
  row: ParsedImportRow;
}) {
  for (const field of fields.filter((item) => item.type === "RELATION")) {
    const names = relationDisplayNamesFromCell(row.valuesByHeader.get(field.name));
    const name = fieldInputName(field.id);
    const targets = fieldTargets.get(field.id) ?? new Map();

    formData.delete(name);

    for (const displayName of names) {
      const matches = targets.get(displayName) ?? [];

      if (matches.length === 0) {
        errors.push({
          row: row.rowNumber,
          field: field.name,
          message: `No existe un registro relacionado con displayName “${displayName}”.`,
        });
        continue;
      }

      if (matches.length > 1) {
        errors.push({
          row: row.rowNumber,
          field: field.name,
          message: `El displayName “${displayName}” es ambiguo para ${field.name}.`,
        });
        continue;
      }

      formData.append(name, matches[0].id);
    }
  }
}

function relationDisplayNamesFromCell(value: unknown) {
  if (isBlankCellValue(value)) {
    return [];
  }

  return Array.from(
    new Set(
      String(value)
        .split(/\s*\|\s*/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

async function getRelationTargetsByDisplayName(
  contractId: string,
  field: ImportField,
  displayNames: string[],
) {
  const config = getRelationConfig(field.config);

  if (!config.targetEntityTypeId || displayNames.length === 0) {
    return new Map<string, RelationTargetMatch[]>();
  }

  const targets = await prisma.entityRecord.findMany({
    where: {
      displayName: { in: displayNames },
      entityType: {
        id: config.targetEntityTypeId,
        contractId,
      },
    },
    select: {
      id: true,
      displayName: true,
      entityTypeId: true,
    },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
  });
  const byDisplayName = new Map<string, RelationTargetMatch[]>();

  for (const target of targets) {
    byDisplayName.set(target.displayName, [
      ...(byDisplayName.get(target.displayName) ?? []),
      target,
    ]);
  }

  return byDisplayName;
}

function assertNoDuplicateFieldNames(fields: ImportField[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const field of fields) {
    if (seen.has(field.name)) {
      duplicates.add(field.name);
    }

    seen.add(field.name);
  }

  if (duplicates.size > 0) {
    throw new EntityImportUserError(
      `Existen campos importables con nombres duplicados: ${Array.from(duplicates).join(", ")}.`,
    );
  }
}

function assertExcelFile(file: File) {
  if (file.size > ENTITY_IMPORT_LIMITS.maxFileSizeBytes) {
    throw new EntityImportUserError("El archivo no puede superar 5 MB.");
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new EntityImportUserError(
      "Selecciona una plantilla Excel descargada desde esta entidad.",
    );
  }
}

function validateHeaders(headers: string[], fields: ImportField[]) {
  const expectedHeaders = fields.map((field) => field.name);
  const hasRecordId = headers[0] === RECORD_ID_HEADER;
  const comparableHeaders = hasRecordId ? headers.slice(1) : headers;

  if (headers.length === 0 || headers.some((header) => !header)) {
    throw new EntityImportUserError(structureErrorMessage);
  }

  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);

  if (duplicateHeaders.length > 0) {
    throw new EntityImportUserError(structureErrorMessage);
  }

  if (
    comparableHeaders.length !== expectedHeaders.length ||
    comparableHeaders.some((header, index) => header !== expectedHeaders[index])
  ) {
    throw new EntityImportUserError(structureErrorMessage);
  }

  return hasRecordId;
}

function rowValues(row: ExcelJS.Row) {
  const values = Array.isArray(row.values) ? row.values.slice(1) : [];

  return values;
}

function cellToHeader(value: unknown) {
  return String(cellToImportValue(value) ?? "").trim();
}

function importRowValues({
  fields,
  hasRecordId,
  headers,
  row,
}: {
  fields: ImportField[];
  hasRecordId: boolean;
  headers: string[];
  row: ExcelJS.Row;
}) {
  return headers.map((_, index) => {
    const fieldIndex = hasRecordId ? index - 1 : index;
    const field = fieldIndex >= 0 ? fields[fieldIndex] : undefined;
    const preserveText = field?.type === "TEXT" || field?.type === "TEXTAREA";

    return cellToImportValueFromCell(row.getCell(index + 1), preserveText);
  });
}

function cellToImportValueFromCell(cell: ExcelJS.Cell, preserveText: boolean): unknown {
  if (!preserveText) {
    return cellToImportValue(cell.value);
  }

  return textCellToImportValue(cell);
}

function textCellToImportValue(cell: ExcelJS.Cell) {
  const value = cell.value;

  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return cellToImportValue(value);
  }

  if (typeof value === "object") {
    const record = value as { formula?: unknown; result?: unknown; text?: string; richText?: Array<{ text?: string }> };

    if (record.formula !== undefined) {
      return cellToImportValue(value);
    }

    if (record.text !== undefined || Array.isArray(record.richText)) {
      return cellToImportValue(value);
    }
  }

  if (typeof value === "number") {
    return formatNumericTextCell(value, cell.numFmt) ?? cell.text;
  }

  return cell.text || cellToImportValue(value);
}

function formatNumericTextCell(value: number, numFmt?: string) {
  if (!numFmt || !Number.isFinite(value)) {
    return null;
  }

  const normalizedFormat = numFmt.replace(/"/g, "");
  const station = /^([0#]+)\+([0#]+)([,.]([0#]+))?$/.exec(normalizedFormat);

  if (station) {
    return formatStationNumber(value, {
      decimalPlaces: station[4]?.length ?? 0,
      decimalSeparator: station[3]?.[0] ?? ".",
      leftDigits: station[1].length,
      rightDigits: station[2].length,
    });
  }

  const paddedInteger = /^(\+?)(0+)$/.exec(normalizedFormat);

  if (paddedInteger && Number.isInteger(value)) {
    return `${paddedInteger[1]}${String(Math.abs(value)).padStart(paddedInteger[2].length, "0")}`;
  }

  return null;
}

function formatStationNumber(
  value: number,
  {
    decimalPlaces,
    decimalSeparator,
    leftDigits,
    rightDigits,
  }: {
    decimalPlaces: number;
    decimalSeparator: string;
    leftDigits: number;
    rightDigits: number;
  },
) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const fixed = absolute.toFixed(decimalPlaces);
  const [integerPart = "0", decimalPart = ""] = fixed.split(".");
  const integer = Number.parseInt(integerPart, 10);
  const left = Math.floor(integer / 1000);
  const right = integer % 1000;
  const decimal = decimalPlaces > 0 ? `${decimalSeparator}${decimalPart}` : "";

  return `${sign}${String(left).padStart(leftDigits, "0")}+${String(right).padStart(rightDigits, "0")}${decimal}`;
}

function cellToImportValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "object") {
    const record = value as { result?: unknown; text?: string; richText?: Array<{ text?: string }> };

    if (record.result !== undefined) {
      return cellToImportValue(record.result);
    }

    if (record.text !== undefined) {
      return record.text;
    }

    if (Array.isArray(record.richText)) {
      return record.richText.map((item) => item.text ?? "").join("");
    }

    throw new EntityImportUserError(
      "No fue posible leer el archivo. Verifica que sea una plantilla Excel válida.",
    );
  }

  return String(value);
}

function isBlankCellValue(value: unknown) {
  return value === undefined || value === null || String(value).trim() === "";
}

function excelValueToFormValues(field: ImportField, value: unknown) {
  if (isBlankCellValue(value)) {
    return [];
  }

  switch (field.type) {
    case "BOOLEAN":
      return [parseBooleanCell(value, field) ? "on" : "false"];
    case "DATE":
      return [parseDateCell(value, field, false)];
    case "DATETIME":
      return [parseDateCell(value, field, true)];
    case "TIME":
      return [String(value).trim()];
    case "SELECT":
      return [optionLabelToValue(field, String(value).trim())];
    case "MULTISELECT":
      return Array.from(
        new Set(
          String(value)
            .split(";")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((label) => optionLabelToValue(field, label)),
        ),
      );
    case "RELATION":
      return relationDisplayNamesFromCell(value);
    default:
      return [String(value).trim()];
  }
}

function parseBooleanCell(value: unknown, field: ImportField) {
  const normalized = String(value).trim().toLowerCase();

  if (["verdadero", "true", "sí", "si", "1"].includes(normalized)) {
    return true;
  }

  if (["falso", "false", "no", "0"].includes(normalized)) {
    return false;
  }

  throw new FieldValidationError({ [field.id]: ["Debe ser Verdadero o Falso."] });
}

function parseDateCell(value: unknown, field: ImportField, includeTime: boolean) {
  if (value instanceof Date) {
    return includeTime ? value.toISOString() : dateOnlyInputValue(value);
  }

  const text = String(value).trim();
  const pattern = includeTime
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})?$/
    : /^\d{4}-\d{2}-\d{2}$/;

  const isValid = includeTime
    ? pattern.test(text) && !Number.isNaN(new Date(text).getTime())
    : Boolean(dateOnlyToUtcDate(text));

  if (!isValid) {
    throw new FieldValidationError({
      [field.id]: [
        includeTime
          ? "Debe ser una fecha y hora ISO válida."
          : "Debe ser una fecha válida en formato YYYY-MM-DD.",
      ],
    });
  }

  return text;
}

function optionLabelToValue(field: ImportField, label: string) {
  const option = field.options.find((item) => item.isActive && item.label === label);

  if (!option) {
    throw new FieldValidationError({
      [field.id]: [`La opción “${label}” no existe para el campo ${field.name}.`],
    });
  }

  return option.value;
}

function exportEntityValue(
  field: ImportField,
  value: ExistingRecord["values"][number],
) {
  if (field.type === "BOOLEAN" && value.booleanValue !== null) {
    return value.booleanValue ? "Verdadero" : "Falso";
  }

  if (field.type === "INTEGER" && value.integerValue !== null) {
    return value.integerValue;
  }

  if ((field.type === "DECIMAL" || field.type === "MONEY") && value.decimalValue !== null) {
    return value.decimalValue.toString();
  }

  if (field.type === "DATE" && value.dateValue) {
    return dateOnlyInputValue(value.dateValue);
  }

  if (field.type === "DATETIME" && value.dateValue) {
    return value.dateValue.toISOString();
  }

  if (field.type === "SELECT" && value.textValue) {
    return field.options.find((option) => option.value === value.textValue)?.label ?? value.textValue;
  }

  if (field.type === "MULTISELECT" && Array.isArray(value.jsonValue)) {
    return value.jsonValue
      .map((item) => {
        const optionValue = String(item);

        return field.options.find((option) => option.value === optionValue)?.label ?? optionValue;
      })
      .join("; ");
  }

  return deserializeEntityValue({
    ...value,
    entityField: {
      type: field.type,
      config: field.config,
      options: field.options,
    },
  });
}

async function getExistingImportRecords(
  entityTypeId: string,
  rows: ParsedImportRow[],
): Promise<ExistingRecord[]> {
  const recordIds = Array.from(
    new Set(rows.map((row) => row.recordId).filter((recordId): recordId is string => Boolean(recordId))),
  );

  if (recordIds.length === 0) {
    return [];
  }

  return prisma.entityRecord.findMany({
    where: {
      id: { in: recordIds },
      entityTypeId,
    },
    select: {
      id: true,
      displayName: true,
      values: {
        select: {
          entityFieldId: true,
          textValue: true,
          integerValue: true,
          decimalValue: true,
          booleanValue: true,
          dateValue: true,
          jsonValue: true,
        },
      },
    },
  });
}

async function updateRecordDisplayNames(
  tx: Prisma.TransactionClient,
  records: Array<{ id: string; displayName: string }>,
) {
  const cases = records.map(
    (record) => Prisma.sql`WHEN "id" = ${record.id} THEN ${record.displayName}`,
  );

  await tx.$executeRaw(
    Prisma.sql`
      UPDATE "EntityRecord"
      SET "displayName" = CASE ${Prisma.join(cases, " ")} ELSE "displayName" END
      WHERE "id" IN (${Prisma.join(records.map((record) => record.id))})
    `,
  );
}

export async function getExistingUniqueValues(entityTypeId: string, field: ImportField) {
  const values = await getExistingUniqueValuesByRecord(entityTypeId, field);

  return new Set(values.keys());
}

export async function getExistingUniqueValuesByRecord(entityTypeId: string, field: ImportField) {
  const values = await prisma.entityValue.findMany({
    where: {
      entityFieldId: field.id,
      entityRecord: {
        entityTypeId,
      },
    },
    select: {
      entityRecordId: true,
      textValue: true,
      integerValue: true,
      decimalValue: true,
      booleanValue: true,
      dateValue: true,
      jsonValue: true,
    },
  });

  return new Map(
    values
      .map((value) => [uniqueValueSignature(value), value.entityRecordId] as const)
      .filter(([signature]) => Boolean(signature)),
  );
}

function uniqueValueSignature(value: SerializedFieldValue | {
  textValue: string | null;
  integerValue: number | null;
  decimalValue: Prisma.Decimal | null;
  booleanValue: boolean | null;
  dateValue: Date | null;
  jsonValue: Prisma.JsonValue | null;
}) {
  if (value.textValue !== undefined && value.textValue !== null) return `text:${value.textValue}`;
  if (value.integerValue !== undefined && value.integerValue !== null) return `int:${value.integerValue}`;
  if (value.decimalValue !== undefined && value.decimalValue !== null) return `dec:${value.decimalValue.toString()}`;
  if (value.booleanValue !== undefined && value.booleanValue !== null) return `bool:${value.booleanValue}`;
  if (value.dateValue !== undefined && value.dateValue !== null) return `date:${value.dateValue.toISOString()}`;
  if (value.jsonValue !== undefined && value.jsonValue !== null && value.jsonValue !== Prisma.JsonNull) return `json:${JSON.stringify(value.jsonValue)}`;

  return "";
}

function toExcelSheetName(name: string) {
  const clean = name.replace(/[\\/*?:[\]]/g, " ").trim() || "Plantilla";

  return clean.slice(0, 31);
}
