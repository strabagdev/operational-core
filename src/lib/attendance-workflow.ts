import { Prisma, type EntityFieldType } from "@prisma/client";

import { userCanAccessAppView } from "@/lib/app-view-access";
import { parseAppViewConfig, type AppViewConfig } from "@/lib/app-views";
import { stableRecordRequestHash } from "@/lib/api-record-writes";
import { badRequest, conflict, forbidden, internalError, notFound } from "@/lib/api-response";
import { dateOnlyToUtcDate } from "@/lib/date-only";
import { getRelationConfig } from "@/lib/field-validation";
import { prisma } from "@/lib/prisma";
import {
  attendanceStateUpdateConfig,
  getStateUpdateContextForConfig,
  mapStateUpdateException,
  saveStateUpdateEntry,
  type StateUpdateResult,
} from "@/lib/state-update-workflow";

export type AttendanceEntryInput = {
  expectedUpdatedAt?: string;
  observation?: string | null;
  overwrite?: boolean;
  personRecordId: string;
  statusOptionId: string;
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
        statusLabel: string | null;
        statusOptionId: string | null;
        updatedAt: string;
      };
      personRecordId: string;
      requested: {
        statusLabel: string;
        statusOptionId: string;
      };
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
  options: Array<{ id: string; isActive: boolean; label: string; sortOrder: number; value: string }>;
  multiple: boolean;
  required: boolean;
  searchable: boolean;
  sortOrder: number;
  type: EntityFieldType;
};
type AttendanceStatusOption = {
  id: string;
  isDefaultCheckIn: boolean;
  label: string;
  value: string;
};
type AttendanceContext = {
  appView: {
    id: string;
    name: string;
    slug: string;
  };
  config: AttendanceConfig;
  sourceEntityType: {
    fields: AttendanceField[];
    id: string;
    name: string;
  };
  targetEntityType: {
    fields: AttendanceField[];
    id: string;
    name: string;
  };
  statusOptions: AttendanceStatusOption[];
  statusOptionsByValue: Map<string, AttendanceStatusOption>;
};
const attendanceSearchLimit = 20;
const latestAttendanceLimit = 10;

export async function getAttendanceWorkflowDay({
  appViewId,
  contractId,
  date,
  personRecordId,
  search,
  userId,
}: {
  appViewId: string;
  contractId: string;
  date: string | null;
  personRecordId?: string | null;
  search?: string | null;
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

  const people = await findAttendancePeople({
    context: context.context,
    personRecordId,
    search,
  });
  const attendances = people.length === 0
    ? []
    : await findExistingAttendances({
        config: context.context.config,
        date: parsedDate.date,
        personRecordIds: people.map((person) => person.id),
        statusOptionsByValue: context.context.statusOptionsByValue,
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
                statusLabel: attendance.statusOption?.label ?? null,
                statusOptionId: attendance.statusOption?.id ?? null,
                updatedAt: attendance.record.updatedAt.toISOString(),
              }
            : null,
        };
      }),
      latest: await getLatestAttendanceRecords({
        config: context.context.config,
        date: parsedDate.date,
        limit: latestAttendanceLimit,
        statusOptionsByValue: context.context.statusOptionsByValue,
        targetEntityTypeId: context.context.targetEntityType.id,
      }),
      sourceEntityType: {
        id: context.context.sourceEntityType.id,
        name: context.context.sourceEntityType.name,
      },
      statuses: context.context.statusOptions.map((option) => ({
        isDefaultCheckIn: option.isDefaultCheckIn,
        label: option.label,
        optionId: option.id,
      })),
      summary: {
        totalRegistered: await countRegisteredAttendances({
          config: context.context.config,
          date: parsedDate.date,
          targetEntityTypeId: context.context.targetEntityType.id,
        }),
      },
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

  const idempotency = await registerAttendanceRequestIdempotency({
    appId,
    appViewId,
    body: parsed.body,
    contractId,
    targetEntityTypeId: context.context.targetEntityType.id,
    userId,
  });

  if (!idempotency.ok) {
    return idempotency;
  }

  if (idempotency.replay) {
    return { ok: true as const, data: idempotency.data };
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
  const stateUpdateContext = await getStateUpdateContextForConfig({
    appView: context.context.appView,
    config: attendanceStateUpdateConfig(context.context.config),
    contractId,
  });

  if (!stateUpdateContext.ok) {
    return stateUpdateContext;
  }

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

    const stateUpdateResult = await saveStateUpdateEntry({
      appId,
      context: stateUpdateContext.context,
      contractId,
      idempotencyKey: null,
      input: {
        date: parsed.body.date,
        dateValue: parsed.body.dateValue,
        expectedUpdatedAt: entry.expectedUpdatedAt,
        extraValues: context.context.config.observationFieldId
          ? { [context.context.config.observationFieldId]: entry.observation ?? null }
          : {},
        overwrite: entry.overwrite === true,
        states: { [context.context.config.statusFieldId]: entry.statusOptionId },
        subjectRecordId: entry.personRecordId,
      },
      userId,
    }).catch((error) => mapStateUpdateException(error));

    results.push(mapStateUpdateResultToAttendance({
      personRecordId: entry.personRecordId,
      result: stateUpdateResult.ok
        ? stateUpdateResult.result
        : {
            code: "STATE_UPDATE_FAILED",
            message: "No fue posible guardar la asistencia.",
            result: "ERROR",
          },
      statusFieldId: context.context.config.statusFieldId,
    }));
  }

  const data = {
    appView: context.context.appView,
    date: parsed.body.dateValue,
    results,
  };

  if (idempotency.key) {
    await persistAttendanceIdempotencyResult({
      appId,
      clientRequestId: parsed.body.clientRequestId,
      data,
      entityRecordId: firstAttendanceRecordId(results),
      operation: idempotency.key.operation,
    });
  }

  return {
    ok: true as const,
    data,
  };
}

function mapStateUpdateResultToAttendance({
  personRecordId,
  result,
  statusFieldId,
}: {
  personRecordId: string;
  result: StateUpdateResult | { code: string; message: string; result: "ERROR" };
  statusFieldId: string;
}): AttendanceEntryResult {
  if (result.result === "CREATED" || result.result === "UNCHANGED" || result.result === "UPDATED") {
    return {
      personRecordId,
      recordId: result.recordId,
      result: result.result,
    };
  }

  if (result.result === "CONFLICT") {
    const difference = result.differences.find((item) => item.fieldId === statusFieldId) ?? result.differences[0];

    return {
      existing: {
        recordId: result.existing.recordId,
        statusLabel: difference?.existingLabel ?? null,
        statusOptionId: difference?.existingOptionId ?? null,
        updatedAt: result.existing.updatedAt,
      },
      personRecordId,
      requested: {
        statusLabel: difference?.requestedLabel ?? "",
        statusOptionId: difference?.requestedOptionId ?? "",
      },
      result: "CONFLICT",
    };
  }

  return {
    code: "code" in result && result.code === "INVALID_STATE_OPTION"
      ? "INVALID_STATUS_OPTION"
      : "code" in result ? result.code : "STATE_UPDATE_FAILED",
    message: "message" in result ? result.message : "No fue posible guardar la asistencia.",
    personRecordId,
    result: "ERROR",
  };
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
  statusOption: AttendanceStatusOption | null;
};

async function findExistingAttendances({
  config,
  date,
  personRecordIds,
  statusOptionsByValue,
  targetEntityTypeId,
}: {
  config: AttendanceConfig;
  date: Date;
  personRecordIds: string[];
  statusOptionsByValue: Map<string, AttendanceStatusOption>;
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

    const statusValue = record.values.find((value) => value.entityFieldId === config.statusFieldId)?.textValue;

    firstByPerson.set(personRecordId, {
      observation: config.observationFieldId
        ? record.values.find((value) => value.entityFieldId === config.observationFieldId)?.textValue ?? null
        : null,
      personRecordId,
      record,
      statusOption: statusValue ? statusOptionsByValue.get(statusValue) ?? null : null,
    });
  }

  return Array.from(firstByPerson.values());
}

async function findAttendancePeople({
  context,
  personRecordId,
  search,
}: {
  context: AttendanceContext;
  personRecordId?: string | null;
  search?: string | null;
}) {
  const normalizedPersonRecordId = personRecordId?.trim();
  const normalizedSearch = search?.trim();

  if (normalizedPersonRecordId) {
    return prisma.entityRecord.findMany({
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: {
        displayName: true,
        id: true,
      },
      take: 1,
      where: {
        entityTypeId: context.sourceEntityType.id,
        id: normalizedPersonRecordId,
      },
    });
  }

  if (!normalizedSearch) {
    return [];
  }

  return prisma.entityRecord.findMany({
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    select: {
      displayName: true,
      id: true,
    },
    take: attendanceSearchLimit,
    where: buildAttendancePeopleSearchWhere({
      entityTypeId: context.sourceEntityType.id,
      fields: context.sourceEntityType.fields,
      query: normalizedSearch,
    }),
  });
}

function buildAttendancePeopleSearchWhere({
  entityTypeId,
  fields,
  query,
}: {
  entityTypeId: string;
  fields: AttendanceField[];
  query: string;
}): Prisma.EntityRecordWhereInput {
  const textFieldIds = fields
    .filter((field) => field.searchable && attendanceSearchableTextFieldTypes.has(field.type))
    .map((field) => field.id);
  const selectValueSearches = fields
    .filter((field) => field.searchable && field.type === "SELECT")
    .map((field) => ({
      fieldId: field.id,
      values: field.options
        .filter((option) => optionMatchesSearch(option, query))
        .map((option) => option.value),
    }))
    .filter((item) => item.values.length > 0);
  const orConditions: Prisma.EntityRecordWhereInput[] = [
    {
      displayName: {
        contains: query,
        mode: "insensitive",
      },
    },
  ];

  if (textFieldIds.length > 0) {
    orConditions.push({
      values: {
        some: {
          entityFieldId: { in: textFieldIds },
          textValue: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
    });
  }

  for (const search of selectValueSearches) {
    orConditions.push({
      values: {
        some: {
          entityFieldId: search.fieldId,
          textValue: { in: search.values },
        },
      },
    });
  }

  return {
    entityTypeId,
    OR: orConditions,
  };
}

async function countRegisteredAttendances({
  config,
  date,
  targetEntityTypeId,
}: {
  config: AttendanceConfig;
  date: Date;
  targetEntityTypeId: string;
}) {
  return prisma.entityRecord.count({
    where: {
      entityTypeId: targetEntityTypeId,
      values: {
        some: {
          dateValue: date,
          entityFieldId: config.dateFieldId,
        },
      },
    },
  });
}

async function getLatestAttendanceRecords({
  config,
  date,
  limit,
  statusOptionsByValue,
  targetEntityTypeId,
}: {
  config: AttendanceConfig;
  date: Date;
  limit: number;
  statusOptionsByValue: Map<string, AttendanceStatusOption>;
  targetEntityTypeId: string;
}) {
  const records = await prisma.entityRecord.findMany({
    include: {
      outgoingRelations: {
        select: {
          targetRecord: {
            select: {
              displayName: true,
              id: true,
            },
          },
          targetRecordId: true,
        },
        where: {
          sourceFieldId: config.personFieldId,
        },
      },
      values: {
        select: {
          entityFieldId: true,
          textValue: true,
        },
        where: {
          entityFieldId: config.statusFieldId,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit,
    where: {
      entityTypeId: targetEntityTypeId,
      values: {
        some: {
          dateValue: date,
          entityFieldId: config.dateFieldId,
        },
      },
    },
  });

  return records.map((record) => {
    const statusValue = record.values.find((value) => value.entityFieldId === config.statusFieldId)?.textValue;
    const statusOption = statusValue ? statusOptionsByValue.get(statusValue) ?? null : null;
    const person = record.outgoingRelations[0]?.targetRecord ?? null;

    return {
      attendanceRecordId: record.id,
      person: person
        ? {
            displayName: person.displayName,
            id: person.id,
          }
        : null,
      statusLabel: statusOption?.label ?? null,
      statusOptionId: statusOption?.id ?? null,
      updatedAt: record.updatedAt.toISOString(),
    };
  });
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
        fields: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            config: true,
            id: true,
            key: true,
            multiple: true,
            name: true,
            options: {
              orderBy: [{ sortOrder: "asc" }, { label: "asc" }, { id: "asc" }],
              select: {
                id: true,
                isActive: true,
                label: true,
                sortOrder: true,
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
            multiple: true,
            name: true,
            options: {
              orderBy: [{ sortOrder: "asc" }, { label: "asc" }, { id: "asc" }],
              select: {
                id: true,
                isActive: true,
                label: true,
                sortOrder: true,
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
      sourceEntityType: {
        fields: sourceEntityType.fields,
        id: sourceEntityType.id,
        name: sourceEntityType.name,
      },
      targetEntityType,
      statusOptions: configValidation.statusOptions,
      statusOptionsByValue: configValidation.statusOptionsByValue,
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
    !fieldRelationTargetsEntity(personField.config, sourceEntityTypeId) ||
    getRelationConfig(personField.config).relationKind !== "ONE"
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

  if (!statusField || statusField.type !== "SELECT" || statusField.multiple) {
    return {
      ok: false as const,
      response: badRequest("La configuración de asistencia tiene un campo Estado inválido.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

  const statusOptions = getAttendanceStatusOptions({
    defaultCheckInOptionId: config.defaultCheckInOptionId,
    statusField,
  });

  if (!statusOptions.ok) {
    return {
      ok: false as const,
      response: badRequest(statusOptions.message, "INVALID_WORKFLOW_CONFIG"),
    };
  }

  if (config.observationFieldId && (!observationField || observationField.type !== "TEXTAREA")) {
    return {
      ok: false as const,
      response: badRequest("La configuración de asistencia tiene un campo Observación inválido.", "INVALID_WORKFLOW_CONFIG"),
    };
  }

	  return {
	    ok: true as const,
	    statusOptions: statusOptions.statusOptions,
	    statusOptionsByValue: statusOptions.statusOptionsByValue,
	  };
}

function fieldRelationTargetsEntity(config: Prisma.JsonValue | null, entityTypeId: string) {
  return getRelationConfig(config).targetEntityTypeId === entityTypeId;
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

    if (typeof entry.statusOptionId !== "string" || !entry.statusOptionId.trim()) {
      return {
        ok: false as const,
        response: badRequest("statusOptionId es obligatorio.", "INVALID_ATTENDANCE_STATUS"),
      };
    }

    entries.push({
      expectedUpdatedAt: typeof entry.expectedUpdatedAt === "string" ? entry.expectedUpdatedAt : undefined,
      observation: typeof entry.observation === "string"
        ? entry.observation.trim() || null
        : entry.observation === null ? null : undefined,
      overwrite: entry.overwrite === true,
      personRecordId: entry.personRecordId.trim(),
      statusOptionId: entry.statusOptionId.trim(),
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
  userId,
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
  userId: string;
}) {
  if (!body.clientRequestId) {
    return { key: null, ok: true as const, replay: false as const };
  }

  const operation = `workflow:attendance:${contractId}:${appViewId}`;
  const requestHash = stableRecordRequestHash({
    date: body.dateValue,
    entries: body.entries,
    userId,
  });
  const key = { operation, requestHash };

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

    return { key, ok: true as const, replay: false as const };
  } catch (error) {
    if (!isIdempotencyConflict(error)) {
      throw error;
    }

    const replay = await resolveAttendanceIdempotencyReplay({
      appId,
      clientRequestId: body.clientRequestId,
      operation,
      requestHash,
    });

    if (!replay.ok) {
      return replay;
    }

    return { key, ok: true as const, replay: true as const, data: replay.data };
  }
}

async function resolveAttendanceIdempotencyReplay({
  appId,
  clientRequestId,
  operation,
  requestHash,
}: {
  appId: string;
  clientRequestId: string;
  operation: string;
  requestHash: string;
}) {
  const existing = await prisma.apiIdempotencyKey.findUnique({
    select: { requestHash: true, responseBody: true },
    where: {
      externalAppId_operation_clientRequestId: {
        clientRequestId,
        externalAppId: appId,
        operation,
      },
    },
  });

  if (!existing) {
    return {
      ok: false as const,
      response: internalError("No se pudo resolver la idempotencia.", "IDEMPOTENCY_RESOLUTION_FAILED"),
    };
  }

  if (existing.requestHash !== requestHash) {
    return {
      ok: false as const,
      response: conflict("clientRequestId ya fue usado con otro payload.", "IDEMPOTENCY_KEY_REUSED"),
    };
  }

  if (!isAttendanceReplayData(existing.responseBody)) {
    return {
      ok: false as const,
      response: conflict(
        "La llave idempotente existe pero no tiene resultado replayable.",
        "IDEMPOTENCY_RESULT_UNAVAILABLE",
      ),
    };
  }

  return { ok: true as const, data: existing.responseBody };
}

async function persistAttendanceIdempotencyResult({
  appId,
  clientRequestId,
  data,
  entityRecordId,
  operation,
}: {
  appId: string;
  clientRequestId?: string;
  data: { appView: { id: string; name: string; slug: string }; date: string; results: AttendanceEntryResult[] };
  entityRecordId: string | null;
  operation: string;
}) {
  if (!clientRequestId) return;

  await prisma.apiIdempotencyKey.update({
    data: {
      completedAt: new Date(),
      entityRecordId,
      responseBody: data as Prisma.InputJsonValue,
    },
    where: {
      externalAppId_operation_clientRequestId: {
        clientRequestId,
        externalAppId: appId,
        operation,
      },
    },
  });
}

function firstAttendanceRecordId(results: AttendanceEntryResult[]) {
  return results.find((result) => "recordId" in result)?.recordId ?? null;
}

function isAttendanceReplayData(value: Prisma.JsonValue | null): value is {
  appView: { id: string; name: string; slug: string };
  date: string;
  results: AttendanceEntryResult[];
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "appView" in value &&
      "date" in value &&
      "results" in value,
  );
}

function isIdempotencyConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function getAttendanceStatusOptions({
  defaultCheckInOptionId,
  statusField,
}: {
  defaultCheckInOptionId: string;
  statusField: AttendanceField;
}):
  | {
      ok: true;
      statusOptions: AttendanceStatusOption[];
      statusOptionsByValue: Map<string, AttendanceStatusOption>;
    }
  | { ok: false; message: string } {
  const activeOptions = statusField.options.filter((option) => option.isActive);

  if (activeOptions.length === 0) {
    return {
      ok: false,
      message: "El campo Estado debe tener al menos una opción activa.",
    };
  }

  if (!activeOptions.some((option) => option.id === defaultCheckInOptionId)) {
    return {
      ok: false,
      message: "El estado por defecto de checking debe pertenecer al campo Estado y estar activo.",
    };
  }

  const statusOptions = activeOptions.map((option) => ({
    id: option.id,
    isDefaultCheckIn: option.id === defaultCheckInOptionId,
    label: option.label,
    value: option.value,
  }));

	  return {
	    ok: true,
	    statusOptions,
	    statusOptionsByValue: new Map(statusOptions.map((option) => [option.value, option])),
	  };
	}

const attendanceSearchableTextFieldTypes = new Set<EntityFieldType>([
  "TEXT",
  "TEXTAREA",
  "EMAIL",
  "PHONE",
  "URL",
  "TIME",
]);

function optionMatchesSearch(
  option: { label: string; value: string },
  query: string,
) {
  const normalizedQuery = query.toLocaleLowerCase();

  return (
    option.label.toLocaleLowerCase().includes(normalizedQuery) ||
    option.value.toLocaleLowerCase().includes(normalizedQuery)
  );
}
