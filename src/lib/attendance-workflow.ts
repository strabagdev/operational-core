import { Prisma, type EntityFieldType } from "@prisma/client";

import {
  buildValueChanges,
  createAuditEvent,
} from "@/lib/audit";
import { userCanAccessAppView } from "@/lib/app-view-access";
import { parseAppViewConfig, type AppViewConfig } from "@/lib/app-views";
import { stableRecordRequestHash } from "@/lib/api-record-writes";
import { badRequest, conflict, forbidden, notFound } from "@/lib/api-response";
import { dateOnlyInputValue, dateOnlyToUtcDate } from "@/lib/date-only";
import { getRecordDisplayName, type SerializedFieldValue } from "@/lib/field-validation";
import { prisma } from "@/lib/prisma";
import { syncEntityRelations } from "@/lib/entity-records";

export type AttendanceStatus = "PRESENTE" | "AUSENTE";
export type AttendanceEntryInput = {
  expectedStatus?: AttendanceStatus;
  expectedUpdatedAt?: string;
  observation?: string | null;
  overwrite?: boolean;
  personRecordId: string;
  status: AttendanceStatus;
};
export type AttendanceEntryResult =
  | {
      personRecordId: string;
      recordId: string;
      result: "CREATED" | "UNCHANGED" | "UPDATED";
    }
  | {
      existing: {
        recordId: string;
        status: AttendanceStatus | null;
        updatedAt: string;
      };
      personRecordId: string;
      requestedStatus: AttendanceStatus;
      result: "CONFLICT";
    }
  | {
      code: string;
      message: string;
      personRecordId: string;
      result: "ERROR";
    };

type AttendanceConfig = Extract<AppViewConfig, { type: "WORKFLOW"; workflowKey: "attendance" }>;
type AttendanceField = {
  config: Prisma.JsonValue | null;
  id: string;
  key: string;
  name: string;
  options: Array<{ isActive: boolean; label?: string; value: string }>;
  required: boolean;
  searchable: boolean;
  sortOrder: number;
  type: EntityFieldType;
};
type AttendanceContext = {
  appView: {
    id: string;
    name: string;
    slug: string;
  };
  config: AttendanceConfig;
  sourceEntityType: {
    id: string;
    name: string;
  };
  targetEntityType: {
    fields: AttendanceField[];
    id: string;
    name: string;
  };
};

export async function getAttendanceWorkflowDay({
  appViewId,
  contractId,
  date,
  userId,
}: {
  appViewId: string;
  contractId: string;
  date: string | null;
  userId: string;
}) {
  const parsedDate = parseAttendanceDate(date);

  if (!parsedDate.ok) {
    return parsedDate;
  }

  const context = await getAttendanceWorkflowContext({ appViewId, contractId, userId });

  if (!context.ok) {
    return context;
  }

  const people = await prisma.entityRecord.findMany({
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    select: {
      displayName: true,
      id: true,
    },
    where: {
      entityTypeId: context.context.sourceEntityType.id,
    },
  });
  const attendances = people.length === 0
    ? []
    : await findExistingAttendances({
        config: context.context.config,
        date: parsedDate.date,
        personRecordIds: people.map((person) => person.id),
        targetEntityTypeId: context.context.targetEntityType.id,
      });
  const attendanceByPersonId = new Map(
    attendances.map((attendance) => [attendance.personRecordId, attendance]),
  );

  return {
    ok: true as const,
    data: {
      appView: context.context.appView,
      date: parsedDate.value,
      items: people.map((person) => {
        const attendance = attendanceByPersonId.get(person.id);

        return {
          person,
          attendance: attendance
            ? {
                observation: attendance.observation,
                recordId: attendance.record.id,
                status: attendance.status,
                updatedAt: attendance.record.updatedAt.toISOString(),
              }
            : null,
        };
      }),
      sourceEntityType: context.context.sourceEntityType,
      targetEntityType: {
        id: context.context.targetEntityType.id,
        name: context.context.targetEntityType.name,
      },
    },
  };
}

export async function saveAttendanceWorkflowDay({
  appId,
  appViewId,
  body,
  contractId,
  userId,
}: {
  appId: string;
  appViewId: string;
  body: unknown;
  contractId: string;
  userId: string;
}) {
  const context = await getAttendanceWorkflowContext({ appViewId, contractId, userId });

  if (!context.ok) {
    return context;
  }

  const parsed = parseAttendanceSaveBody(body);

  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.body.clientRequestId) {
    const idempotency = await registerAttendanceRequestIdempotency({
      appId,
      appViewId,
      body: parsed.body,
      contractId,
      targetEntityTypeId: context.context.targetEntityType.id,
    });

    if (!idempotency.ok) {
      return idempotency;
    }
  }

  const personIds = Array.from(new Set(parsed.body.entries.map((entry) => entry.personRecordId)));
  const people = personIds.length === 0
    ? []
    : await prisma.entityRecord.findMany({
        select: {
          displayName: true,
          id: true,
        },
        where: {
          entityTypeId: context.context.sourceEntityType.id,
          id: { in: personIds },
        },
      });
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const results: AttendanceEntryResult[] = [];

  for (const entry of parsed.body.entries) {
    const person = peopleById.get(entry.personRecordId);

    if (!person) {
      results.push({
        code: "INVALID_PERSON",
        message: "La persona no pertenece a la entidad fuente configurada.",
        personRecordId: entry.personRecordId,
        result: "ERROR",
      });
      continue;
    }

    results.push(await saveAttendanceEntry({
      appId,
      config: context.context.config,
      contractId,
      date: parsed.body.date,
      entry,
      person,
      targetEntityType: context.context.targetEntityType,
      userId,
    }));
  }

  return {
    ok: true as const,
    data: {
      appView: context.context.appView,
      date: parsed.body.dateValue,
      results,
    },
  };
}

async function saveAttendanceEntry({
  appId,
  config,
  contractId,
  date,
  entry,
  person,
  targetEntityType,
  userId,
}: {
  appId: string;
  config: AttendanceConfig;
  contractId: string;
  date: Date;
  entry: AttendanceEntryInput;
  person: { displayName: string; id: string };
  targetEntityType: AttendanceContext["targetEntityType"];
  userId: string;
}): Promise<AttendanceEntryResult> {
  const existing = (await findExistingAttendances({
    config,
    date,
    personRecordIds: [person.id],
    targetEntityTypeId: targetEntityType.id,
  }))[0];

  if (!existing) {
    const record = await createAttendanceRecord({
      appId,
      config,
      contractId,
      date,
      entry,
      person,
      targetEntityType,
      userId,
    });

    return {
      personRecordId: entry.personRecordId,
      recordId: record.id,
      result: "CREATED",
    };
  }

  if (existing.status === entry.status) {
    return {
      personRecordId: entry.personRecordId,
      recordId: existing.record.id,
      result: "UNCHANGED",
    };
  }

  if (!entry.overwrite) {
    return conflictResult(entry, existing);
  }

  if (!entry.expectedStatus && !entry.expectedUpdatedAt) {
    return {
      code: "OVERWRITE_EXPECTATION_REQUIRED",
      message: "overwrite requiere expectedStatus o expectedUpdatedAt.",
      personRecordId: entry.personRecordId,
      result: "ERROR",
    };
  }

  if (
    (entry.expectedStatus && existing.status !== entry.expectedStatus) ||
    (entry.expectedUpdatedAt && existing.record.updatedAt.toISOString() !== entry.expectedUpdatedAt)
  ) {
    return conflictResult(entry, existing);
  }

  const record = await updateAttendanceRecord({
    appId,
    config,
    contractId,
    entry,
    existing,
    targetEntityType,
    userId,
  });

  return {
    personRecordId: entry.personRecordId,
    recordId: record.id,
    result: "UPDATED",
  };
}

async function createAttendanceRecord({
  appId,
  config,
  contractId,
  date,
  entry,
  person,
  targetEntityType,
  userId,
}: {
  appId: string;
  config: AttendanceConfig;
  contractId: string;
  date: Date;
  entry: AttendanceEntryInput;
  person: { displayName: string; id: string };
  targetEntityType: AttendanceContext["targetEntityType"];
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const values = attendanceValues({ config, date, entry });
    const displayName = getRecordDisplayName(targetEntityType.fields, values) ||
      `${person.displayName} ${dateOnlyInputValue(date)}`;
    const record = await tx.entityRecord.create({
      data: {
        displayName,
        entityTypeId: targetEntityType.id,
      },
    });

    await writeAttendanceValues(tx, record.id, values);
    await syncEntityRelations(tx, record.id, [{
      fieldId: config.personFieldId,
      targetRecordIds: [person.id],
    }]);
    await createAuditEvent(tx, {
      actorUserId: userId,
      action: "RECORD_CREATED",
      changes: buildValueChanges({
        fields: targetEntityType.fields,
        oldValues: [],
        newValues: values,
      }),
      contractId,
      entityRecordId: record.id,
      entityTypeId: targetEntityType.id,
      metadata: {
        apiExternalAppId: appId,
        displayName: record.displayName,
        workflowKey: "attendance",
      },
      summary: `Creó asistencia ${record.displayName}`,
    });

    return record;
  });
}

async function updateAttendanceRecord({
  appId,
  config,
  contractId,
  entry,
  existing,
  targetEntityType,
  userId,
}: {
  appId: string;
  config: AttendanceConfig;
  contractId: string;
  entry: AttendanceEntryInput;
  existing: ExistingAttendance;
  targetEntityType: AttendanceContext["targetEntityType"];
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const mutableFieldIds = [
      config.statusFieldId,
      ...(config.observationFieldId ? [config.observationFieldId] : []),
    ];
    const newValues = attendanceMutableValues({ config, entry });

    await tx.entityValue.deleteMany({
      where: {
        entityFieldId: { in: mutableFieldIds },
        entityRecordId: existing.record.id,
      },
    });
    await writeAttendanceValues(tx, existing.record.id, newValues);
    const record = await tx.entityRecord.update({
      data: {
        displayName: existing.record.displayName,
      },
      where: { id: existing.record.id },
    });

    await createAuditEvent(tx, {
      actorUserId: userId,
      action: "RECORD_UPDATED",
      changes: buildValueChanges({
        fields: targetEntityType.fields.filter((field) => mutableFieldIds.includes(field.id)),
        oldValues: existing.record.values,
        newValues,
      }),
      contractId,
      entityRecordId: existing.record.id,
      entityTypeId: targetEntityType.id,
      metadata: {
        apiExternalAppId: appId,
        displayName: record.displayName,
        workflowKey: "attendance",
      },
      summary: `Actualizó asistencia ${record.displayName}`,
    });

    return record;
  });
}

type ExistingAttendance = {
  observation: string | null;
  personRecordId: string;
  record: {
    displayName: string;
    id: string;
    updatedAt: Date;
    values: Array<{
      dateValue: Date | null;
      entityFieldId: string;
      textValue: string | null;
    }>;
  };
  status: AttendanceStatus | null;
};

async function findExistingAttendances({
  config,
  date,
  personRecordIds,
  targetEntityTypeId,
}: {
  config: AttendanceConfig;
  date: Date;
  personRecordIds: string[];
  targetEntityTypeId: string;
}): Promise<ExistingAttendance[]> {
  if (personRecordIds.length === 0) {
    return [];
  }

  const records = await prisma.entityRecord.findMany({
    include: {
      outgoingRelations: {
        select: {
          targetRecordId: true,
        },
        where: {
          sourceFieldId: config.personFieldId,
          targetRecordId: { in: personRecordIds },
        },
      },
      values: {
        select: {
          dateValue: true,
          entityFieldId: true,
          textValue: true,
        },
        where: {
          entityFieldId: {
            in: [
              config.dateFieldId,
              config.statusFieldId,
              ...(config.observationFieldId ? [config.observationFieldId] : []),
            ],
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    where: {
      entityTypeId: targetEntityTypeId,
      outgoingRelations: {
        some: {
          sourceFieldId: config.personFieldId,
          targetRecordId: { in: personRecordIds },
        },
      },
      values: {
        some: {
          dateValue: date,
          entityFieldId: config.dateFieldId,
        },
      },
    },
  });
  const firstByPerson = new Map<string, ExistingAttendance>();

  for (const record of records) {
    const personRecordId = record.outgoingRelations[0]?.targetRecordId;

    if (!personRecordId || firstByPerson.has(personRecordId)) {
      continue;
    }

    const status = record.values.find((value) => value.entityFieldId === config.statusFieldId)?.textValue;

    firstByPerson.set(personRecordId, {
      observation: config.observationFieldId
        ? record.values.find((value) => value.entityFieldId === config.observationFieldId)?.textValue ?? null
        : null,
      personRecordId,
      record,
      status: status === "PRESENTE" || status === "AUSENTE" ? status : null,
    });
  }

  return Array.from(firstByPerson.values());
}

async function getAttendanceWorkflowContext({
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
    select: {
      config: true,
      id: true,
      name: true,
      slug: true,
      type: true,
    },
    where: {
      active: true,
      contractId,
      id: appViewId,
      type: "WORKFLOW",
    },
  });

  if (!appView) {
    return {
      ok: false as const,
      response: notFound("Vista no encontrada.", "APP_VIEW_NOT_FOUND"),
    };
  }

  const config = parseAppViewConfig(appView);

  if (config.type !== "WORKFLOW" || config.workflowKey !== "attendance") {
    return {
      ok: false as const,
      response: badRequest("La vista no está configurada para asistencia.", "INVALID_WORKFLOW"),
    };
  }

  const [sourceEntityType, targetEntityType] = await Promise.all([
    prisma.entityType.findFirst({
      select: {
        id: true,
        name: true,
      },
      where: {
        contractId,
        id: config.sourceEntityTypeId,
        isActive: true,
      },
    }),
    prisma.entityType.findFirst({
      select: {
        fields: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            config: true,
            id: true,
            key: true,
            name: true,
            options: {
              select: {
                isActive: true,
                label: true,
                value: true,
              },
            },
            required: true,
            searchable: true,
            sortOrder: true,
            type: true,
          },
          where: { isActive: true },
        },
        id: true,
        name: true,
      },
      where: {
        contractId,
        id: config.targetEntityTypeId,
        isActive: true,
      },
    }),
  ]);

  if (!sourceEntityType || !targetEntityType) {
    return {
      ok: false as const,
      response: badRequest("La configuración de asistencia referencia entidades no disponibles.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

  const configValidation = validateAttendanceRuntimeConfig({
    config,
    sourceEntityTypeId: sourceEntityType.id,
    targetFields: targetEntityType.fields,
  });

  if (!configValidation.ok) {
    return configValidation;
  }

  return {
    ok: true as const,
    context: {
      appView: {
        id: appView.id,
        name: appView.name,
        slug: appView.slug,
      },
      config,
      sourceEntityType,
      targetEntityType,
    },
  };
}

function validateAttendanceRuntimeConfig({
  config,
  sourceEntityTypeId,
  targetFields,
}: {
  config: AttendanceConfig;
  sourceEntityTypeId: string;
  targetFields: AttendanceField[];
}) {
  const personField = targetFields.find((field) => field.id === config.personFieldId);
  const dateField = targetFields.find((field) => field.id === config.dateFieldId);
  const statusField = targetFields.find((field) => field.id === config.statusFieldId);
  const observationField = config.observationFieldId
    ? targetFields.find((field) => field.id === config.observationFieldId)
    : undefined;

  if (
    !personField ||
    personField.type !== "RELATION" ||
    !fieldRelationTargetsEntity(personField.config, sourceEntityTypeId)
  ) {
    return {
      ok: false as const,
      response: badRequest("La configuración de asistencia tiene un campo Persona inválido.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

  if (!dateField || dateField.type !== "DATE") {
    return {
      ok: false as const,
      response: badRequest("La configuración de asistencia tiene un campo Fecha inválido.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

  if (!statusField || statusField.type !== "SELECT") {
    return {
      ok: false as const,
      response: badRequest("La configuración de asistencia tiene un campo Estado inválido.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

  const statusOptions = new Set(
    statusField.options.filter((option) => option.isActive).map((option) => option.value),
  );

  if (!statusOptions.has("PRESENTE") || !statusOptions.has("AUSENTE")) {
    return {
      ok: false as const,
      response: badRequest("La configuración de asistencia no tiene estados compatibles.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

  if (config.observationFieldId && (!observationField || observationField.type !== "TEXTAREA")) {
    return {
      ok: false as const,
      response: badRequest("La configuración de asistencia tiene un campo Observación inválido.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

  return { ok: true as const };
}

function fieldRelationTargetsEntity(config: Prisma.JsonValue | null, entityTypeId: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return false;
  }

  return (config as Record<string, unknown>).targetEntityTypeId === entityTypeId;
}

function parseAttendanceDate(value: string | null) {
  if (!value) {
    return {
      ok: false as const,
      response: badRequest("date es obligatorio.", "INVALID_ATTENDANCE_DATE"),
    };
  }

  const date = dateOnlyToUtcDate(value);

  if (!date) {
    return {
      ok: false as const,
      response: badRequest("date debe tener formato YYYY-MM-DD.", "INVALID_ATTENDANCE_DATE"),
    };
  }

  return { ok: true as const, date, value };
}

function parseAttendanceSaveBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false as const,
      response: badRequest("El body debe ser un objeto JSON.", "INVALID_ATTENDANCE_BODY"),
    };
  }

  const raw = body as Record<string, unknown>;
  const parsedDate = parseAttendanceDate(typeof raw.date === "string" ? raw.date : null);

  if (!parsedDate.ok) {
    return parsedDate;
  }

  if (!Array.isArray(raw.entries)) {
    return {
      ok: false as const,
      response: badRequest("entries debe ser un arreglo.", "INVALID_ATTENDANCE_BODY"),
    };
  }

  const entries: AttendanceEntryInput[] = [];

  for (const item of raw.entries) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {
        ok: false as const,
        response: badRequest("Cada entry debe ser un objeto.", "INVALID_ATTENDANCE_BODY"),
      };
    }

    const entry = item as Record<string, unknown>;

    if (typeof entry.personRecordId !== "string" || !entry.personRecordId.trim()) {
      return {
        ok: false as const,
        response: badRequest("personRecordId es obligatorio.", "INVALID_ATTENDANCE_BODY"),
      };
    }

    if (entry.status !== "PRESENTE" && entry.status !== "AUSENTE") {
      return {
        ok: false as const,
        response: badRequest("status debe ser PRESENTE o AUSENTE.", "INVALID_ATTENDANCE_STATUS"),
      };
    }

    const expectedStatus = entry.expectedStatus;

    if (
      expectedStatus !== undefined &&
      expectedStatus !== "PRESENTE" &&
      expectedStatus !== "AUSENTE"
    ) {
      return {
        ok: false as const,
        response: badRequest("expectedStatus debe ser PRESENTE o AUSENTE.", "INVALID_ATTENDANCE_STATUS"),
      };
    }

    entries.push({
      expectedStatus,
      expectedUpdatedAt: typeof entry.expectedUpdatedAt === "string" ? entry.expectedUpdatedAt : undefined,
      observation: typeof entry.observation === "string"
        ? entry.observation.trim() || null
        : entry.observation === null ? null : undefined,
      overwrite: entry.overwrite === true,
      personRecordId: entry.personRecordId.trim(),
      status: entry.status,
    });
  }

  return {
    ok: true as const,
    body: {
      clientRequestId: typeof raw.clientRequestId === "string" ? raw.clientRequestId.trim() || undefined : undefined,
      date: parsedDate.date,
      dateValue: parsedDate.value,
      entries,
    },
  };
}

async function registerAttendanceRequestIdempotency({
  appId,
  appViewId,
  body,
  contractId,
  targetEntityTypeId,
}: {
  appId: string;
  appViewId: string;
  body: {
    clientRequestId?: string;
    dateValue: string;
    entries: AttendanceEntryInput[];
  };
  contractId: string;
  targetEntityTypeId: string;
}) {
  if (!body.clientRequestId) {
    return { ok: true as const };
  }

  const operation = `workflow:attendance:${contractId}:${appViewId}`;
  const requestHash = stableRecordRequestHash({
    date: body.dateValue,
    entries: body.entries,
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
    error.code === "P2002"
  );
}

function attendanceValues({
  config,
  date,
  entry,
}: {
  config: AttendanceConfig;
  date: Date;
  entry: AttendanceEntryInput;
}): SerializedFieldValue[] {
  return [
    { dateValue: date, fieldId: config.dateFieldId },
    ...attendanceMutableValues({ config, entry }),
  ];
}

function attendanceMutableValues({
  config,
  entry,
}: {
  config: AttendanceConfig;
  entry: AttendanceEntryInput;
}): SerializedFieldValue[] {
  return [
    { fieldId: config.statusFieldId, textValue: entry.status },
    ...(config.observationFieldId && entry.observation
      ? [{ fieldId: config.observationFieldId, textValue: entry.observation }]
      : []),
  ];
}

async function writeAttendanceValues(
  tx: Prisma.TransactionClient,
  recordId: string,
  values: SerializedFieldValue[],
) {
  if (values.length === 0) {
    return;
  }

  await tx.entityValue.createMany({
    data: values.map((value) => ({
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

function conflictResult(
  entry: AttendanceEntryInput,
  existing: ExistingAttendance,
): AttendanceEntryResult {
  return {
    existing: {
      recordId: existing.record.id,
      status: existing.status,
      updatedAt: existing.record.updatedAt.toISOString(),
    },
    personRecordId: entry.personRecordId,
    requestedStatus: entry.status,
    result: "CONFLICT",
  };
}
