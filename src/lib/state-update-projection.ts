import { type EntityFieldType } from "@prisma/client";

import { parseAppViewConfig } from "@/lib/app-views";
import { badRequest, notFound } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  findExistingStateUpdates,
  getStateUpdateContextForConfig,
  serializeRecordStates,
  type StateUpdateContext,
} from "@/lib/state-update-workflow";

export type StateUpdateCurrentProjectionField = {
  active: boolean;
  config: {
    display: Record<string, never>;
    validation: Record<string, never>;
  };
  id: string;
  key: string;
  label: string;
  multiple: boolean;
  name: string;
  options?: Array<{
    active: boolean;
    id: string;
    label: string;
    order: number;
    value: string;
  }>;
  order: number;
  required: boolean;
  searchable: boolean;
  type: EntityFieldType;
  unique: boolean;
};

export type StateUpdateCurrentProjectionRow = {
  currentRecordId: string | null;
  currentUpdatedAt: string | null;
  subject: {
    displayName: string;
    id: string;
  };
  states: Record<string, unknown>;
  values: Record<string, unknown>;
};

export async function getStateUpdateCurrentProjection({
  contractId,
  stateUpdateAppViewId,
}: {
  contractId: string;
  stateUpdateAppViewId: string;
}) {
  const appView = await prisma.appView.findFirst({
    select: { config: true, id: true, name: true, slug: true, type: true },
    where: {
      active: true,
      contractId,
      id: stateUpdateAppViewId,
      type: "WORKFLOW",
    },
  });

  if (!appView) {
    return {
      ok: false as const,
      response: notFound("Experiencia STATE_UPDATE no encontrada.", "STATE_UPDATE_VIEW_NOT_FOUND"),
    };
  }

  const config = parseAppViewConfig(appView);

  if (config.type !== "WORKFLOW" || config.workflowKey !== "state-update") {
    return {
      ok: false as const,
      response: badRequest("La experiencia referenciada no es STATE_UPDATE.", "INVALID_STATE_UPDATE_REPORT_SOURCE"),
    };
  }

  if (config.uniqueness.mode !== "subject") {
    return {
      ok: false as const,
      response: badRequest(
        "Los reportes STATE_UPDATE CURRENT solo soportan unicidad por sujeto en esta versión.",
        "UNSUPPORTED_STATE_UPDATE_REPORT_UNIQUENESS",
      ),
    };
  }

  const context = await getStateUpdateContextForConfig({
    appView: { id: appView.id, name: appView.name, slug: appView.slug },
    config,
    contractId,
  });

  if (!context.ok) {
    return context;
  }

  const subjects = await prisma.entityRecord.findMany({
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    select: { displayName: true, id: true },
    where: { entityTypeId: context.context.sourceEntityType.id },
  });
  const current = await findExistingStateUpdates({
    context: context.context,
    subjectRecordIds: subjects.map((subject) => subject.id),
  });
  const currentBySubjectId = new Map(current.map((item) => [item.subjectRecordId, item]));

  return {
    ok: true as const,
    data: {
      appView: context.context.appView,
      fields: stateUpdateCurrentProjectionFields(context.context),
      rows: subjects.map((subject) => {
        const existing = currentBySubjectId.get(subject.id);
        const states = existing ? serializeRecordStates(existing.record.values, context.context) : {};

        return {
          currentRecordId: existing?.record.id ?? null,
          currentUpdatedAt: existing?.record.updatedAt.toISOString() ?? null,
          subject,
          states,
          values: stateUpdateCurrentProjectionValues({ currentUpdatedAt: existing?.record.updatedAt ?? null, states, subject }),
        };
      }),
      stateFields: context.context.config.stateFields,
      subjectEntityType: {
        id: context.context.sourceEntityType.id,
        name: context.context.sourceEntityType.name,
        slug: context.context.sourceEntityType.slug,
      },
      targetEntityType: {
        id: context.context.targetEntityType.id,
        name: context.context.targetEntityType.name,
        slug: context.context.targetEntityType.slug,
      },
      workflow: {
        historyMode: context.context.config.historyMode,
        uniqueness: context.context.config.uniqueness,
      },
    },
  };
}

function stateUpdateCurrentProjectionFields(context: StateUpdateContext): StateUpdateCurrentProjectionField[] {
  return [
    {
      active: true,
      config: { display: {}, validation: {} },
      id: "subject.displayName",
      key: "subject.displayName",
      label: context.sourceEntityType.name,
      multiple: false,
      name: context.sourceEntityType.name,
      order: 0,
      required: true,
      searchable: false,
      type: "TEXT",
      unique: false,
    },
    ...context.config.stateFields.map((stateField) => {
      const field = context.targetEntityType.fields.find((item) => item.id === stateField.fieldId);

      if (!field) {
        return null;
      }

      return {
        active: true,
        config: { display: {}, validation: {} },
        id: `state:${field.id}`,
        key: `state:${field.id}`,
        label: stateField.label ?? field.name,
        multiple: false,
        name: stateField.label ?? field.name,
        ...(field.type === "SELECT" ? {
          options: field.options
            .filter((option) => option.isActive)
            .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
            .map((option) => ({
              active: option.isActive,
              id: option.id,
              label: option.label,
              order: option.sortOrder,
              value: option.value,
            })),
        } : {}),
        order: field.sortOrder,
        required: stateField.required,
        searchable: false,
        type: field.type,
        unique: false,
      };
    }).filter((field): field is StateUpdateCurrentProjectionField => Boolean(field)),
    {
      active: true,
      config: { display: {}, validation: {} },
      id: "current.updatedAt",
      key: "current.updatedAt",
      label: "Actualizado",
      multiple: false,
      name: "Actualizado",
      order: Number.MAX_SAFE_INTEGER,
      required: false,
      searchable: false,
      type: "DATETIME",
      unique: false,
    },
  ];
}

function stateUpdateCurrentProjectionValues({
  currentUpdatedAt,
  states,
  subject,
}: {
  currentUpdatedAt: Date | null;
  states: Record<string, unknown>;
  subject: { displayName: string };
}) {
  return {
    "subject.displayName": subject.displayName,
    ...Object.fromEntries(Object.entries(states).map(([fieldId, value]) => [`state:${fieldId}`, value])),
    "current.updatedAt": currentUpdatedAt?.toISOString() ?? null,
  };
}
