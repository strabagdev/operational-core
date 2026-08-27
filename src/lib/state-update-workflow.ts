import { Prisma, type EntityFieldType } from "@prisma/client";

import {
  buildRelationChanges,
  buildValueChanges,
  createAuditEvent,
} from "@/lib/audit";
import { userCanAccessAppView } from "@/lib/app-view-access";
import {
  parseAppViewConfig,
  type AppViewConfig,
  type AttendanceWorkflowConfig,
  type StateUpdateWorkflowConfig,
} from "@/lib/app-views";
import { stableRecordRequestHash } from "@/lib/api-record-writes";
import { badRequest, conflict, forbidden, internalError, notFound } from "@/lib/api-response";
import { dateOnlyInputValue, dateOnlyToUtcDate } from "@/lib/date-only";
import {
  FieldValidationError,
  fieldInputName,
  getRecordDisplayName,
  getRelationConfig,
  isEmptySerializedValue,
  type SerializedFieldValue,
} from "@/lib/field-validation";
import {
  buildEntityRecordSearchWhere,
  syncEntityRelations,
  validateEntityValues,
  validateRelationValues,
} from "@/lib/entity-records";
import { prisma } from "@/lib/prisma";
import { isStateUpdateCompatibleWorkflow } from "@/lib/workflow-catalog";

type StateUpdateField = {
  config: Prisma.JsonValue | null;
  createdAt: Date;
  description: string | null;
  entityTypeId: string;
  id: string;
  isActive: boolean;
  isUnique: boolean;
  key: string;
  multiple: boolean;
  name: string;
  options: Array<{ id: string; isActive: boolean; label: string; sortOrder: number; value: string }>;
  required: boolean;
  searchable: boolean;
  sortOrder: number;
  type: EntityFieldType;
  updatedAt: Date;
};

type StateOption = {
  fieldId: string;
  id: string;
  label: string;
  value: string;
};

export type StateUpdateContext = {
  appView: { id: string; name: string; slug: string };
  config: StateUpdateWorkflowConfig;
  sourceEntityType: { fields: StateUpdateField[]; id: string; name: string };
  targetEntityType: { fields: StateUpdateField[]; id: string; name: string };
  stateOptionsByFieldId: Map<string, StateOption[]>;
  stateOptionsById: Map<string, StateOption>;
  stateOptionsByValueByFieldId: Map<string, Map<string, StateOption>>;
};

export type StateUpdateInput = {
  clientRequestId?: string;
  date?: Date;
  dateValue?: string;
  expectedUpdatedAt?: string;
  extraValues: Record<string, unknown>;
  overwrite: boolean;
  states: Record<string, string>;
  subjectRecordId: string;
};

export type StateUpdateResult =
  | { recordId: string; result: "CREATED" | "UNCHANGED" | "UPDATED"; subjectRecordId: string }
  | {
      differences: Array<{
        fieldId: string;
        existingOptionId: string | null;
        existingLabel: string | null;
        requestedOptionId: string;
        requestedLabel: string;
      }>;
      existing: { recordId: string; updatedAt: string };
      requested: { states: Record<string, string> };
      result: "CONFLICT";
      subjectRecordId: string;
    }
  | { code: string; message: string; result: "ERROR"; subjectRecordId: string };

export type StateUpdateWorkflowTiming = {
  mark(phase: string): void;
};

const subjectSearchLimit = 20;
const latestStateUpdateLimit = 10;

export function attendanceStateUpdateConfig(config: {
  sourceEntityTypeId: string;
  targetEntityTypeId: string;
  personFieldId: string;
  dateFieldId: string;
  statusFieldId: string;
  defaultCheckInOptionId: string;
  observationFieldId?: string;
}): StateUpdateWorkflowConfig {
  return {
    type: "WORKFLOW",
    workflowKey: "state-update",
    sourceEntityTypeId: config.sourceEntityTypeId,
    targetEntityTypeId: config.targetEntityTypeId,
    subjectFieldId: config.personFieldId,
    stateFields: [{
      fieldId: config.statusFieldId,
      required: true,
      defaultOptionId: config.defaultCheckInOptionId,
    }],
    extraFieldIds: config.observationFieldId ? [config.observationFieldId] : [],
    dateFieldId: config.dateFieldId,
    uniqueness: { mode: "subject-date" },
    historyMode: "update-current",
  };
}

export async function getStateUpdateWorkflow({
  appViewId,
  contractId,
  date,
  search,
  subjectRecordId,
  userId,
}: {
  appViewId: string;
  contractId: string;
  date?: string | null;
  search?: string | null;
  subjectRecordId?: string | null;
  userId: string;
}) {
  const context = await getStateUpdateWorkflowContext({ appViewId, contractId, userId });

  if (!context.ok) {
    return context;
  }

  const parsedDate = parseOptionalDate(date, context.context.config);

  if (!parsedDate.ok) {
    return parsedDate;
  }

  const subjects = await findSubjects({
    context: context.context,
    search,
    subjectRecordId,
  });
  const current = subjects.length === 0 || context.context.config.uniqueness.mode === "none"
    ? []
    : await findExistingStateUpdates({
        context: context.context,
        date: parsedDate.date,
        subjectRecordIds: subjects.map((subject) => subject.id),
      });
  const currentBySubjectId = new Map(current.map((item) => [item.subjectRecordId, item]));

  return {
    ok: true as const,
    data: {
      appView: context.context.appView,
      workflow: workflowMetadata(context.context),
      date: parsedDate.value,
      stateFields: serializeStateFields(context.context),
      extraFields: serializeFields(context.context.targetEntityType.fields.filter((field) =>
        context.context.config.extraFieldIds.includes(field.id),
      )),
      subjectEntityType: {
        id: context.context.sourceEntityType.id,
        name: context.context.sourceEntityType.name,
      },
      targetEntityType: {
        id: context.context.targetEntityType.id,
        name: context.context.targetEntityType.name,
      },
      subjects: subjects.map((subject) => ({
        subject,
        current: serializeExisting(currentBySubjectId.get(subject.id), context.context),
      })),
      latest: await getLatestStateUpdates({
        context: context.context,
        date: parsedDate.date,
        limit: latestStateUpdateLimit,
      }),
      summary: await getStateUpdateSummary({
        context: context.context,
        date: parsedDate.date,
      }),
    },
  };
}

export async function saveStateUpdateWorkflow({
  appId,
  appViewId,
  body,
  contractId,
  timing,
  userId,
}: {
  appId: string;
  appViewId: string;
  body: unknown;
  contractId: string;
  timing?: StateUpdateWorkflowTiming;
  userId: string;
}) {
  const context = await getStateUpdateWorkflowContext({ appViewId, contractId, userId });
  timing?.mark("workflow_config_load");

  if (!context.ok) {
    return context;
  }

  const parsed = parseStateUpdateBody(body, context.context.config);
  timing?.mark("body_validation");

  if (!parsed.ok) {
    return parsed;
  }

  const idempotency = await registerStateUpdateIdempotency({
    appId,
    appViewId,
    body: parsed.body,
    contractId,
    targetEntityTypeId: context.context.targetEntityType.id,
  });
  timing?.mark("idempotency_lookup");

  if (!idempotency.ok) {
    return idempotency;
  }

  const result = await saveStateUpdateEntry({
    appId,
    context: context.context,
    contractId,
    input: parsed.body,
    timing,
    userId,
  }).catch((error) => mapStateUpdateException(error));
  timing?.mark("transaction_write");

  if (!result.ok) {
    return result;
  }

  return {
    ok: true as const,
    data: {
      appView: context.context.appView,
      result: result.result,
    },
  };
}

export async function saveStateUpdateEntry({
  appId,
  context,
  contractId,
  input,
  timing,
  userId,
}: {
  appId: string;
  context: StateUpdateContext;
  contractId: string;
  input: StateUpdateInput;
  timing?: StateUpdateWorkflowTiming;
  userId: string;
}): Promise<{ ok: true; result: StateUpdateResult }> {
  const subject = (await prisma.entityRecord.findMany({
    select: { displayName: true, id: true },
    take: 1,
    where: {
      entityTypeId: context.sourceEntityType.id,
      id: input.subjectRecordId,
    },
  }))[0];
  timing?.mark("subject_lookup");

  if (!subject) {
    return { ok: true, result: {
      code: "INVALID_SUBJECT",
      message: "El sujeto no pertenece a la entidad fuente configurada.",
      result: "ERROR",
      subjectRecordId: input.subjectRecordId,
    }};
  }

  const requested = resolveRequestedStates({ context, input });

  if (!requested.ok) {
    return { ok: true, result: requested.result };
  }

  const existing = context.config.uniqueness.mode === "none"
    ? null
    : (await findExistingStateUpdates({
        context,
        date: input.date,
        subjectRecordIds: [subject.id],
      }))[0] ?? null;
  timing?.mark("existing_target_lookup");

  if (!existing || context.config.historyMode === "append") {
    const record = await createStateUpdateRecord({
      appId,
      context,
      contractId,
      input,
      requestedStates: requested.states,
      subject,
      userId,
    });

    return { ok: true, result: { recordId: record.id, result: "CREATED", subjectRecordId: input.subjectRecordId } };
  }

  const differences = diffRequestedStates({ context, existing, requestedStates: requested.states });

  if (differences.length === 0) {
    return { ok: true, result: { recordId: existing.record.id, result: "UNCHANGED", subjectRecordId: input.subjectRecordId } };
  }

  if (!input.overwrite) {
    return { ok: true, result: conflictResult({ differences, existing, input }) };
  }

  if (!input.expectedUpdatedAt) {
    return { ok: true, result: {
      code: "OVERWRITE_EXPECTATION_REQUIRED",
      message: "overwrite requiere expectedUpdatedAt.",
      result: "ERROR",
      subjectRecordId: input.subjectRecordId,
    }};
  }

  if (existing.record.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    return { ok: true, result: conflictResult({ differences, existing, input }) };
  }

  const record = await updateStateUpdateRecord({
    appId,
    context,
    contractId,
    existing,
    input,
    requestedStates: requested.states,
    userId,
  });

  return { ok: true, result: { recordId: record.id, result: "UPDATED", subjectRecordId: input.subjectRecordId } };
}

async function getStateUpdateWorkflowContext({
  appViewId,
  contractId,
  userId,
}: {
  appViewId: string;
  contractId: string;
  userId: string;
}) {
  const canAccess = await userCanAccessAppView({ appViewId, contractId, userId });

  if (!canAccess) {
    return {
      ok: false as const,
      response: forbidden("No tienes acceso a esta vista.", "APP_VIEW_FORBIDDEN"),
    };
  }

  const appView = await prisma.appView.findFirst({
    select: { config: true, id: true, name: true, slug: true, type: true },
    where: { active: true, contractId, id: appViewId, type: "WORKFLOW" },
  });

  if (!appView) {
    return {
      ok: false as const,
      response: notFound("Vista no encontrada.", "APP_VIEW_NOT_FOUND"),
    };
  }

  const parsedConfig = parseStateUpdateAppViewConfig(appView);

  if (!parsedConfig || parsedConfig.type !== "WORKFLOW" || !isStateUpdateCompatibleWorkflow(parsedConfig.workflowKey)) {
    return {
      ok: false as const,
      response: badRequest("La vista no está configurada para actualización de estado.", "INVALID_WORKFLOW"),
    };
  }

  const stateUpdateConfig = normalizeStateUpdateCompatibleConfig(parsedConfig);

  if (!stateUpdateConfig) {
    return {
      ok: false as const,
      response: badRequest("La vista no está configurada para actualización de estado.", "INVALID_WORKFLOW"),
    };
  }

  return getStateUpdateContextForConfig({
    appView: { id: appView.id, name: appView.name, slug: appView.slug },
    config: stateUpdateConfig,
    contractId,
  });
}

function parseStateUpdateAppViewConfig(appView: Parameters<typeof parseAppViewConfig>[0]) {
  try {
    return parseAppViewConfig(appView);
  } catch {
    return null;
  }
}

export function normalizeStateUpdateCompatibleConfig(config: AppViewConfig): StateUpdateWorkflowConfig | null {
  if (config.type !== "WORKFLOW") {
    return null;
  }

  if (config.workflowKey === "state-update") {
    return config;
  }

  if (config.workflowKey === "attendance") {
    return attendanceStateUpdateConfig(config as AttendanceWorkflowConfig);
  }

  return null;
}

export async function getStateUpdateContextForConfig({
  appView,
  config,
  contractId,
}: {
  appView: { id: string; name: string; slug: string };
  config: StateUpdateWorkflowConfig;
  contractId: string;
}) {
  const [sourceEntityType, targetEntityType] = await Promise.all([
    prisma.entityType.findFirst({
      select: entityTypeSelect(),
      where: { contractId, id: config.sourceEntityTypeId, isActive: true },
    }),
    prisma.entityType.findFirst({
      select: entityTypeSelect(),
      where: { contractId, id: config.targetEntityTypeId, isActive: true },
    }),
  ]);

  if (!sourceEntityType || !targetEntityType) {
    return {
      ok: false as const,
      response: badRequest("La configuración del workflow referencia entidades no disponibles.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

  const validation = validateStateUpdateRuntimeConfig({
    config,
    sourceEntityTypeId: sourceEntityType.id,
    targetFields: targetEntityType.fields,
  });

  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true as const,
    context: {
      appView,
      config,
      sourceEntityType,
      targetEntityType,
      stateOptionsByFieldId: validation.stateOptionsByFieldId,
      stateOptionsById: validation.stateOptionsById,
      stateOptionsByValueByFieldId: validation.stateOptionsByValueByFieldId,
    },
  };
}

function entityTypeSelect() {
  return {
    fields: {
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        config: true,
        createdAt: true,
        description: true,
        entityTypeId: true,
        id: true,
        isActive: true,
        isUnique: true,
        key: true,
        multiple: true,
        name: true,
        options: {
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }, { id: "asc" }],
          select: { id: true, isActive: true, label: true, sortOrder: true, value: true },
        },
        required: true,
        searchable: true,
        sortOrder: true,
        type: true,
        updatedAt: true,
      },
      where: { isActive: true },
    },
    id: true,
    name: true,
  } satisfies Prisma.EntityTypeSelect;
}

function validateStateUpdateRuntimeConfig({
  config,
  sourceEntityTypeId,
  targetFields,
}: {
  config: StateUpdateWorkflowConfig;
  sourceEntityTypeId: string;
  targetFields: StateUpdateField[];
}) {
  const subjectField = targetFields.find((field) => field.id === config.subjectFieldId);

  if (
    !subjectField ||
    subjectField.type !== "RELATION" ||
    getRelationConfig(subjectField.config).targetEntityTypeId !== sourceEntityTypeId ||
    getRelationConfig(subjectField.config).relationKind !== "ONE"
  ) {
    return {
      ok: false as const,
      response: badRequest("La configuración del workflow tiene un campo sujeto inválido.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

  if (config.dateFieldId) {
    const dateField = targetFields.find((field) => field.id === config.dateFieldId);
    if (!dateField || dateField.type !== "DATE") {
      return {
        ok: false as const,
        response: badRequest("La configuración del workflow tiene un campo fecha inválido.", "INVALID_WORKFLOW_CONFIG"),
      };
    }
  }

  const stateOptionsByFieldId = new Map<string, StateOption[]>();
  const stateOptionsById = new Map<string, StateOption>();
  const stateOptionsByValueByFieldId = new Map<string, Map<string, StateOption>>();

  for (const stateField of config.stateFields) {
    const field = targetFields.find((item) => item.id === stateField.fieldId);

    if (!field || field.type !== "SELECT" || field.multiple) {
      return {
        ok: false as const,
        response: badRequest("La configuración del workflow tiene un campo de estado inválido.", "INVALID_WORKFLOW_CONFIG"),
      };
    }

    const options = field.options
      .filter((option) => option.isActive)
      .map((option) => ({
        fieldId: field.id,
        id: option.id,
        label: option.label,
        value: option.value,
      }));

    if (stateField.defaultOptionId && !options.some((option) => option.id === stateField.defaultOptionId)) {
      return {
        ok: false as const,
        response: badRequest("La opción por defecto de estado no está activa o no pertenece al campo.", "INVALID_WORKFLOW_CONFIG"),
      };
    }

    stateOptionsByFieldId.set(field.id, options);
    stateOptionsByValueByFieldId.set(field.id, new Map(options.map((option) => [option.value, option])));
    for (const option of options) {
      stateOptionsById.set(option.id, option);
    }
  }

  for (const extraFieldId of config.extraFieldIds) {
    const field = targetFields.find((item) => item.id === extraFieldId);
    if (!field || !stateUpdateExtraFieldTypes.has(field.type)) {
      return {
        ok: false as const,
        response: badRequest("La configuración del workflow tiene un campo extra inválido.", "INVALID_WORKFLOW_CONFIG"),
      };
    }
  }

  return { ok: true as const, stateOptionsByFieldId, stateOptionsById, stateOptionsByValueByFieldId };
}

function parseOptionalDate(
  date: string | null | undefined,
  config: StateUpdateWorkflowConfig,
):
  | { ok: true; date: Date | undefined; value: string | undefined }
  | { ok: false; response: Response } {
  if (!config.dateFieldId) {
    return { ok: true as const, date: undefined, value: undefined };
  }

  const value = (date ?? dateOnlyInputValue(new Date())).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return {
      ok: false as const,
      response: badRequest("Fecha inválida. Usa YYYY-MM-DD.", "INVALID_DATE"),
    };
  }

  const parsed = dateOnlyToUtcDate(value);

  if (!parsed) {
    return {
      ok: false as const,
      response: badRequest("Fecha inválida. Usa YYYY-MM-DD.", "INVALID_DATE"),
    };
  }

  return { ok: true as const, date: parsed, value };
}

function parseStateUpdateBody(body: unknown, config: StateUpdateWorkflowConfig) {
  if (!isRecord(body)) {
    return writeError("INVALID_STATE_UPDATE_BODY", "El body debe ser un objeto JSON.");
  }

  const subjectRecordId = stringValue(body.subjectRecordId)?.trim();
  if (!subjectRecordId) {
    return writeError("INVALID_STATE_UPDATE_BODY", "subjectRecordId es obligatorio.");
  }

  const parsedDate = parseOptionalDate(stringValue(body.date), config);
  if (!parsedDate.ok) {
    return parsedDate;
  }

  const rawStates = isRecord(body.states) ? body.states : {};
  const states: Record<string, string> = {};
  const allowedStateFieldIds = new Set(config.stateFields.map((field) => field.fieldId));

  for (const [fieldId, optionId] of Object.entries(rawStates)) {
    if (!allowedStateFieldIds.has(fieldId)) {
      return writeError("UNKNOWN_STATE_FIELD", `El campo de estado ${fieldId} no está configurado.`);
    }
    if (typeof optionId !== "string" || !optionId.trim()) {
      return writeError("INVALID_STATE_VALUE", `El estado ${fieldId} debe ser una opción válida.`);
    }
    states[fieldId] = optionId.trim();
  }

  for (const stateField of config.stateFields) {
    if (stateField.required && !states[stateField.fieldId]) {
      return writeError("MISSING_STATE_FIELD", `El campo de estado ${stateField.fieldId} es obligatorio.`);
    }
  }

  const rawExtraValues = isRecord(body.extraValues) ? body.extraValues : {};
  const allowedExtraFieldIds = new Set(config.extraFieldIds);
  for (const fieldId of Object.keys(rawExtraValues)) {
    if (!allowedExtraFieldIds.has(fieldId)) {
      return writeError("UNKNOWN_EXTRA_FIELD", `El campo extra ${fieldId} no está configurado.`);
    }
  }

  return {
    ok: true as const,
    body: {
      clientRequestId: stringValue(body.clientRequestId)?.trim() || undefined,
      date: parsedDate.date,
      dateValue: parsedDate.value ?? undefined,
      expectedUpdatedAt: stringValue(body.expectedUpdatedAt)?.trim() || undefined,
      extraValues: rawExtraValues,
      overwrite: body.overwrite === true,
      states,
      subjectRecordId,
    } satisfies StateUpdateInput,
  };
}

function resolveRequestedStates({
  context,
  input,
}: {
  context: StateUpdateContext;
  input: StateUpdateInput;
}) {
  const states: Record<string, StateOption> = {};

  for (const [fieldId, optionId] of Object.entries(input.states)) {
    const option = context.stateOptionsById.get(optionId);

    if (!option || option.fieldId !== fieldId) {
      return {
        ok: false as const,
        result: {
          code: "INVALID_STATE_OPTION",
          message: "El estado solicitado no pertenece al campo configurado o está inactivo.",
          result: "ERROR" as const,
          subjectRecordId: input.subjectRecordId,
        },
      };
    }

    states[fieldId] = option;
  }

  return { ok: true as const, states };
}

type ExistingStateUpdate = {
  subjectRecordId: string;
  record: {
    displayName: string;
    id: string;
    outgoingRelations: Array<{ sourceFieldId: string; targetRecordId: string }>;
    updatedAt: Date;
    values: Array<{
      booleanValue: boolean | null;
      dateValue: Date | null;
      decimalValue: Prisma.Decimal | null;
      entityFieldId: string;
      integerValue: number | null;
      jsonValue: Prisma.JsonValue;
      textValue: string | null;
    }>;
  };
};

async function findExistingStateUpdates({
  context,
  date,
  subjectRecordIds,
}: {
  context: StateUpdateContext;
  date?: Date;
  subjectRecordIds: string[];
}): Promise<ExistingStateUpdate[]> {
  if (subjectRecordIds.length === 0 || context.config.uniqueness.mode === "none") {
    return [];
  }

  const where: Prisma.EntityRecordWhereInput = {
    entityTypeId: context.targetEntityType.id,
    outgoingRelations: {
      some: {
        sourceFieldId: context.config.subjectFieldId,
        targetRecordId: { in: subjectRecordIds },
      },
    },
  };

  if (context.config.uniqueness.mode === "subject-date") {
    if (!context.config.dateFieldId || !date) {
      return [];
    }

    where.values = {
      some: {
        dateValue: date,
        entityFieldId: context.config.dateFieldId,
      },
    };
  }

  const records = await prisma.entityRecord.findMany({
    include: {
      outgoingRelations: {
        select: { sourceFieldId: true, targetRecordId: true },
        where: {
          sourceFieldId: context.config.subjectFieldId,
          targetRecordId: { in: subjectRecordIds },
        },
      },
      values: {
        select: {
          booleanValue: true,
          dateValue: true,
          decimalValue: true,
          entityFieldId: true,
          integerValue: true,
          jsonValue: true,
          textValue: true,
        },
        where: {
          entityFieldId: {
            in: workflowValueFieldIds(context.config),
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    where,
  });
  const firstBySubject = new Map<string, ExistingStateUpdate>();

  for (const record of records) {
    const subjectRecordId = record.outgoingRelations[0]?.targetRecordId;

    if (!subjectRecordId || firstBySubject.has(subjectRecordId)) {
      continue;
    }

    firstBySubject.set(subjectRecordId, { subjectRecordId, record });
  }

  return Array.from(firstBySubject.values());
}

function diffRequestedStates({
  context,
  existing,
  requestedStates,
}: {
  context: StateUpdateContext;
  existing: ExistingStateUpdate;
  requestedStates: Record<string, StateOption>;
}) {
  const differences: Array<{
    fieldId: string;
    existingOptionId: string | null;
    existingLabel: string | null;
    requestedOptionId: string;
    requestedLabel: string;
  }> = [];

  for (const [fieldId, requestedOption] of Object.entries(requestedStates)) {
    const existingValue = existing.record.values.find((value) => value.entityFieldId === fieldId)?.textValue ?? null;
    const existingOption = existingValue
      ? context.stateOptionsByValueByFieldId.get(fieldId)?.get(existingValue) ?? null
      : null;

    if (existingOption?.id !== requestedOption.id) {
      differences.push({
        fieldId,
        existingOptionId: existingOption?.id ?? null,
        existingLabel: existingOption?.label ?? null,
        requestedOptionId: requestedOption.id,
        requestedLabel: requestedOption.label,
      });
    }
  }

  return differences;
}

function conflictResult({
  differences,
  existing,
  input,
}: {
  differences: Array<{
    fieldId: string;
    existingOptionId: string | null;
    existingLabel: string | null;
    requestedOptionId: string;
    requestedLabel: string;
  }>;
  existing: ExistingStateUpdate;
  input: StateUpdateInput;
}): StateUpdateResult {
  return {
    differences,
    existing: {
      recordId: existing.record.id,
      updatedAt: existing.record.updatedAt.toISOString(),
    },
    requested: { states: input.states },
    result: "CONFLICT",
    subjectRecordId: input.subjectRecordId,
  };
}

async function createStateUpdateRecord({
  appId,
  context,
  contractId,
  input,
  requestedStates,
  subject,
  userId,
}: {
  appId: string;
  context: StateUpdateContext;
  contractId: string;
  input: StateUpdateInput;
  requestedStates: Record<string, StateOption>;
  subject: { displayName: string; id: string };
  userId: string;
}) {
  const mutation = await buildStateUpdateMutation({ context, contractId, input, requestedStates, subjectRecordId: subject.id });

  return prisma.$transaction(async (tx) => {
    const genericDisplayName = getRecordDisplayName(context.targetEntityType.fields, mutation.values);
    const displayName = genericDisplayName === "Registro sin nombre"
      ? fallbackDisplayName(subject.displayName, input.date)
      : genericDisplayName;
    const relationChanges = await buildRelationChanges({
      contractId,
      fields: context.targetEntityType.fields.filter((field) => field.type === "RELATION"),
      oldRelations: [],
      newRelations: mutation.relations,
    });
    const record = await tx.entityRecord.create({
      data: { displayName, entityTypeId: context.targetEntityType.id },
    });

    await writeEntityValues(tx, record.id, mutation.values);
    await syncEntityRelations(tx, record.id, mutation.relations);
    await createAuditEvent(tx, {
      actorUserId: userId,
      action: "RECORD_CREATED",
      changes: [
        ...buildValueChanges({
          fields: context.targetEntityType.fields,
          oldValues: [],
          newValues: mutation.values,
        }),
        ...relationChanges.added,
      ],
      contractId,
      entityRecordId: record.id,
      entityTypeId: context.targetEntityType.id,
      metadata: {
        apiExternalAppId: appId,
        displayName: record.displayName,
        workflowKey: "state-update",
      },
      summary: `Creó ${context.targetEntityType.name} ${record.displayName}`,
    });

    return record;
  });
}

async function updateStateUpdateRecord({
  appId,
  context,
  contractId,
  existing,
  input,
  requestedStates,
  userId,
}: {
  appId: string;
  context: StateUpdateContext;
  contractId: string;
  existing: ExistingStateUpdate;
  input: StateUpdateInput;
  requestedStates: Record<string, StateOption>;
  userId: string;
}) {
  const mutation = await buildStateUpdateMutation({
    context,
    contractId,
    existing,
    input,
    requestedStates,
    subjectRecordId: input.subjectRecordId,
  });
  const mutableFieldIds = workflowMutableFieldIds(context.config);

  return prisma.$transaction(async (tx) => {
    const relationChanges = await buildRelationChanges({
      contractId,
      fields: context.targetEntityType.fields.filter((field) => mutableFieldIds.includes(field.id) && field.type === "RELATION"),
      oldRelations: existing.record.outgoingRelations,
      newRelations: mutation.relations,
    });

    await tx.entityValue.deleteMany({
      where: {
        entityFieldId: { in: mutableFieldIds },
        entityRecordId: existing.record.id,
      },
    });
    await writeEntityValues(tx, existing.record.id, mutation.values.filter((value) => mutableFieldIds.includes(value.fieldId)));
    await syncEntityRelations(tx, existing.record.id, mutation.relations);
    const record = await tx.entityRecord.update({
      data: { displayName: existing.record.displayName },
      where: { id: existing.record.id },
    });

    await createAuditEvent(tx, {
      actorUserId: userId,
      action: "RECORD_UPDATED",
      changes: buildValueChanges({
        fields: context.targetEntityType.fields.filter((field) => mutableFieldIds.includes(field.id)),
        oldValues: existing.record.values,
        newValues: mutation.values,
      }),
      contractId,
      entityRecordId: record.id,
      entityTypeId: context.targetEntityType.id,
      metadata: {
        apiExternalAppId: appId,
        displayName: record.displayName,
        workflowKey: "state-update",
      },
      summary: `Actualizó ${context.targetEntityType.name} ${record.displayName}`,
    });

    if (relationChanges.added.length > 0) {
      await createAuditEvent(tx, {
        actorUserId: userId,
        action: "RELATION_ADDED",
        changes: relationChanges.added,
        contractId,
        entityRecordId: record.id,
        entityTypeId: context.targetEntityType.id,
        metadata: { apiExternalAppId: appId, displayName: record.displayName, workflowKey: "state-update" },
        summary: `Agregó relaciones en ${context.targetEntityType.name} ${record.displayName}`,
      });
    }

    if (relationChanges.removed.length > 0) {
      await createAuditEvent(tx, {
        actorUserId: userId,
        action: "RELATION_REMOVED",
        changes: relationChanges.removed,
        contractId,
        entityRecordId: record.id,
        entityTypeId: context.targetEntityType.id,
        metadata: { apiExternalAppId: appId, displayName: record.displayName, workflowKey: "state-update" },
        summary: `Quitó relaciones en ${context.targetEntityType.name} ${record.displayName}`,
      });
    }

    return record;
  });
}

async function buildStateUpdateMutation({
  context,
  contractId,
  existing,
  input,
  requestedStates,
  subjectRecordId,
}: {
  context: StateUpdateContext;
  contractId: string;
  existing?: ExistingStateUpdate;
  input: StateUpdateInput;
  requestedStates: Record<string, StateOption>;
  subjectRecordId: string;
}) {
  const formData = new FormData();

  if (existing) {
    appendExistingValues(context.targetEntityType.fields, existing, formData);
  }

  formData.set(fieldInputName(context.config.subjectFieldId), subjectRecordId);

  if (context.config.dateFieldId && input.dateValue) {
    formData.set(fieldInputName(context.config.dateFieldId), input.dateValue);
  }

  for (const [fieldId, option] of Object.entries(requestedStates)) {
    formData.set(fieldInputName(fieldId), option.value);
  }

  for (const [fieldId, value] of Object.entries(input.extraValues)) {
    appendRawValue(formData, requireField(context, fieldId), value);
  }

  try {
    const valueFields = stateUpdateValueValidationFields(context);
    const values = await validateEntityValues({
      fields: valueFields,
      formData,
      mode: existing ? "edit" : "create",
      recordId: existing?.record.id,
    });
    const extraRelationFields = context.targetEntityType.fields.filter((field) =>
      context.config.extraFieldIds.includes(field.id) && field.type === "RELATION",
    );
    const extraRelations = extraRelationFields.length === 0
      ? []
      : await validateRelationValues({
          contractId,
          entityTypeId: context.targetEntityType.id,
          fields: extraRelationFields,
          formData,
          sourceRecordId: existing?.record.id,
        });
    const relations = [
      { fieldId: context.config.subjectFieldId, targetRecordIds: [subjectRecordId] },
      ...extraRelations,
    ];

    return { values, relations };
  } catch (error) {
    if (error instanceof FieldValidationError || (error instanceof Error && error.name === "UserFacingError")) {
      throw error;
    }

    throw error;
  }
}

function appendRawValue(formData: FormData, field: StateUpdateField, value: unknown) {
  const name = fieldInputName(field.id);
  formData.delete(name);

  if (value === null || value === undefined) {
    return;
  }

  if (field.type === "INTEGER") {
    if (typeof value !== "number" || !Number.isInteger(value)) throw new StateUpdateInputError("INVALID_EXTRA_VALUE", `${field.name} debe ser entero.`);
    formData.set(name, String(value));
    return;
  }

  if (field.type === "DECIMAL" || field.type === "MONEY") {
    if (typeof value !== "number" && typeof value !== "string") throw new StateUpdateInputError("INVALID_EXTRA_VALUE", `${field.name} debe ser decimal.`);
    formData.set(name, String(value));
    return;
  }

  if (field.type === "BOOLEAN") {
    if (typeof value !== "boolean") throw new StateUpdateInputError("INVALID_EXTRA_VALUE", `${field.name} debe ser boolean.`);
    formData.set(name, value ? "true" : "false");
    return;
  }

  if (field.type === "RELATION") {
    const values = Array.isArray(value) ? value : [value];
    if (!values.every((item) => typeof item === "string")) throw new StateUpdateInputError("INVALID_EXTRA_VALUE", `${field.name} debe contener ids.`);
    for (const item of values) formData.append(name, item);
    return;
  }

  if (typeof value !== "string") {
    throw new StateUpdateInputError("INVALID_EXTRA_VALUE", `${field.name} debe ser string.`);
  }

  formData.set(name, value);
}

function appendExistingValues(fields: StateUpdateField[], existing: ExistingStateUpdate, formData: FormData) {
  for (const field of fields) {
    const name = fieldInputName(field.id);

    if (field.type === "RELATION") {
      for (const relation of existing.record.outgoingRelations.filter((item) => item.sourceFieldId === field.id)) {
        formData.append(name, relation.targetRecordId);
      }
      continue;
    }

    const value = existing.record.values.find((item) => item.entityFieldId === field.id);
    if (!value) continue;

    if (value.textValue != null) formData.set(name, value.textValue);
    if (value.integerValue != null) formData.set(name, String(value.integerValue));
    if (value.decimalValue != null) formData.set(name, value.decimalValue.toString());
    if (value.booleanValue != null) formData.set(name, value.booleanValue ? "true" : "false");
    if (value.dateValue != null) formData.set(name, field.type === "DATE" ? dateOnlyInputValue(value.dateValue) : value.dateValue.toISOString());
    if (Array.isArray(value.jsonValue)) {
      for (const item of value.jsonValue) formData.append(name, String(item));
    }
  }
}

async function findSubjects({
  context,
  search,
  subjectRecordId,
}: {
  context: StateUpdateContext;
  search?: string | null;
  subjectRecordId?: string | null;
}) {
  const normalizedSubjectRecordId = subjectRecordId?.trim();
  const normalizedSearch = search?.trim();

  if (normalizedSubjectRecordId) {
    return prisma.entityRecord.findMany({
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: { displayName: true, id: true },
      take: 1,
      where: { entityTypeId: context.sourceEntityType.id, id: normalizedSubjectRecordId },
    });
  }

  if (!normalizedSearch) {
    return [];
  }

  return prisma.entityRecord.findMany({
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    select: { displayName: true, id: true },
    take: subjectSearchLimit,
    where: buildEntityRecordSearchWhere({
      entityTypeId: context.sourceEntityType.id,
      fields: context.sourceEntityType.fields,
      query: normalizedSearch,
    }),
  });
}

async function getLatestStateUpdates({
  context,
  date,
  limit,
}: {
  context: StateUpdateContext;
  date?: Date;
  limit: number;
}) {
  const where: Prisma.EntityRecordWhereInput = {
    entityTypeId: context.targetEntityType.id,
    outgoingRelations: { some: { sourceFieldId: context.config.subjectFieldId } },
  };

  if (context.config.dateFieldId && date) {
    where.values = { some: { dateValue: date, entityFieldId: context.config.dateFieldId } };
  }

  const records = await prisma.entityRecord.findMany({
    include: {
      outgoingRelations: {
        select: { sourceFieldId: true, targetRecord: { select: { displayName: true, id: true } }, targetRecordId: true },
        where: { sourceFieldId: context.config.subjectFieldId },
      },
      values: {
        select: {
          booleanValue: true,
          dateValue: true,
          decimalValue: true,
          entityFieldId: true,
          integerValue: true,
          jsonValue: true,
          textValue: true,
        },
        where: { entityFieldId: { in: workflowValueFieldIds(context.config) } },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit,
    where,
  });

  return records.map((record) => ({
    recordId: record.id,
    subject: record.outgoingRelations[0]?.targetRecord ?? null,
    states: serializeRecordStates(record.values, context),
    updatedAt: record.updatedAt.toISOString(),
  }));
}

async function getStateUpdateSummary({
  context,
  date,
}: {
  context: StateUpdateContext;
  date?: Date;
}) {
  const where: Prisma.EntityRecordWhereInput = { entityTypeId: context.targetEntityType.id };

  if (context.config.dateFieldId && date) {
    where.values = { some: { dateValue: date, entityFieldId: context.config.dateFieldId } };
  }

  return {
    totalRegistered: await prisma.entityRecord.count({ where }),
  };
}

function serializeExisting(existing: ExistingStateUpdate | undefined, context: StateUpdateContext) {
  if (!existing) {
    return null;
  }

  return {
    recordId: existing.record.id,
    states: serializeRecordStates(existing.record.values, context),
    updatedAt: existing.record.updatedAt.toISOString(),
  };
}

function serializeRecordStates(values: Array<{ entityFieldId: string; textValue: string | null }>, context: StateUpdateContext) {
  return Object.fromEntries(context.config.stateFields.map((stateField) => {
    const value = values.find((item) => item.entityFieldId === stateField.fieldId)?.textValue ?? null;
    const option = value
      ? context.stateOptionsByValueByFieldId.get(stateField.fieldId)?.get(value) ?? null
      : null;

    return [stateField.fieldId, option ? { optionId: option.id, label: option.label } : null];
  }));
}

function serializeStateFields(context: StateUpdateContext) {
  return context.config.stateFields.map((stateField) => {
    const field = requireField(context, stateField.fieldId);

    return {
      defaultOptionId: stateField.defaultOptionId ?? null,
      field: serializeField(field),
      required: stateField.required,
      options: context.stateOptionsByFieldId.get(field.id)?.map((option) => ({
        optionId: option.id,
        label: option.label,
        value: option.value,
      })) ?? [],
    };
  });
}

function serializeFields(fields: StateUpdateField[]) {
  return fields.map(serializeField);
}

function serializeField(field: StateUpdateField) {
  return {
    id: field.id,
    key: field.key,
    name: field.name,
    required: field.required,
    type: field.type,
  };
}

function workflowMetadata(context: StateUpdateContext) {
  return {
    workflowKey: "state-update",
    historyMode: context.config.historyMode,
    uniqueness: context.config.uniqueness,
    subjectFieldId: context.config.subjectFieldId,
    dateFieldId: context.config.dateFieldId ?? null,
  };
}

function workflowValueFieldIds(config: StateUpdateWorkflowConfig) {
  return [
    ...config.stateFields.map((field) => field.fieldId),
    ...config.extraFieldIds,
    ...(config.dateFieldId ? [config.dateFieldId] : []),
  ];
}

function workflowMutableFieldIds(config: StateUpdateWorkflowConfig) {
  return [
    ...workflowValueFieldIds(config),
    config.subjectFieldId,
  ];
}

function stateUpdateValueValidationFields(context: StateUpdateContext) {
  const stateRequiredByFieldId = new Map(
    context.config.stateFields.map((field) => [field.fieldId, field.required]),
  );
  const valueFieldIds = new Set(workflowValueFieldIds(context.config));

  return context.targetEntityType.fields
    .filter((field) => valueFieldIds.has(field.id))
    .map((field) => stateRequiredByFieldId.has(field.id)
      ? { ...field, required: stateRequiredByFieldId.get(field.id) ?? false }
      : field);
}

function fallbackDisplayName(subjectDisplayName: string, date?: Date) {
  return date ? `${subjectDisplayName} · ${dateOnlyInputValue(date).split("-").reverse().join("-")}` : subjectDisplayName;
}

function requireField(context: StateUpdateContext, fieldId: string) {
  const field = context.targetEntityType.fields.find((item) => item.id === fieldId);
  if (!field) {
    throw new StateUpdateInputError("UNKNOWN_FIELD", `El campo ${fieldId} no existe.`);
  }
  return field;
}

async function writeEntityValues(
  tx: Prisma.TransactionClient,
  recordId: string,
  values: SerializedFieldValue[],
) {
  const nonEmptyValues = values.filter((value) => !isEmptySerializedValue(value));

  if (nonEmptyValues.length === 0) {
    return;
  }

  await tx.entityValue.createMany({
    data: nonEmptyValues.map((value) => ({
      booleanValue: value.booleanValue ?? null,
      dateValue: value.dateValue ?? null,
      decimalValue: value.decimalValue ?? null,
      entityFieldId: value.fieldId,
      entityRecordId: recordId,
      integerValue: value.integerValue ?? null,
      jsonValue: value.jsonValue ?? Prisma.JsonNull,
      textValue: value.textValue ?? null,
    })),
  });
}

async function registerStateUpdateIdempotency({
  appId,
  appViewId,
  body,
  contractId,
  targetEntityTypeId,
}: {
  appId: string;
  appViewId: string;
  body: StateUpdateInput;
  contractId: string;
  targetEntityTypeId: string;
}) {
  if (!body.clientRequestId) {
    return { ok: true as const };
  }

  const operation = `workflow:state-update:${contractId}:${appViewId}`;
  const requestHash = stableRecordRequestHash({
    date: body.dateValue ?? null,
    expectedUpdatedAt: body.expectedUpdatedAt ?? null,
    extraValues: body.extraValues,
    overwrite: body.overwrite,
    states: body.states,
    subjectRecordId: body.subjectRecordId,
  });

  try {
    await prisma.apiIdempotencyKey.create({
      data: {
        clientRequestId: body.clientRequestId,
        contractId,
        entityTypeId: targetEntityTypeId,
        externalAppId: appId,
        operation,
        requestHash,
      },
    });

    return { ok: true as const };
  } catch (error) {
    if (!isIdempotencyConflict(error)) {
      throw error;
    }

    const existing = await prisma.apiIdempotencyKey.findUnique({
      select: { requestHash: true },
      where: {
        externalAppId_operation_clientRequestId: {
          clientRequestId: body.clientRequestId,
          externalAppId: appId,
          operation,
        },
      },
    });

    if (existing?.requestHash === requestHash) {
      return { ok: true as const };
    }

    return {
      ok: false as const,
      response: conflict("clientRequestId ya fue usado con otro payload.", "IDEMPOTENCY_CONFLICT"),
    };
  }
}

function isIdempotencyConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("externalAppId") &&
    error.meta.target.includes("clientRequestId")
  );
}

function writeError(code: string, message: string) {
  return { ok: false as const, response: badRequest(message, code) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

class StateUpdateInputError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StateUpdateInputError";
    this.code = code;
  }
}

const stateUpdateExtraFieldTypes = new Set<EntityFieldType>([
  "TEXT",
  "TEXTAREA",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "BOOLEAN",
  "DATE",
  "TIME",
  "DATETIME",
  "SELECT",
  "RELATION",
]);

export function mapStateUpdateException(error: unknown) {
  if (error instanceof StateUpdateInputError) {
    return writeError(error.code, error.message);
  }

  if (error instanceof FieldValidationError) {
    return writeError("INVALID_FIELD_VALUE", "Uno o más campos tienen valores inválidos.");
  }

  if (error instanceof Error && error.name === "UserFacingError") {
    return writeError("INVALID_RELATION", error.message);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return writeError("UNIQUE_CONSTRAINT", "Existe otro registro con un valor único igual.");
  }

  return { ok: false as const, response: internalError("No fue posible guardar el workflow.", "STATE_UPDATE_FAILED") };
}
