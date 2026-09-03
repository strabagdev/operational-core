import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAppView,
  friendlyAppViewError,
  getAppViewAdminData,
  getAppViewInput,
  parseAppViewConfig,
  setAppViewActive,
  updateAppView,
} from "./app-views";
import { prisma } from "./prisma";

vi.mock("./contracts", () => ({
  getAuthorizedContractAdmin: vi.fn(async (contractId: string) => {
    if (contractId === "blocked_contract") {
      return null;
    }

    return {
      code: contractId,
      description: null,
      id: contractId,
      name: "Contrato",
      organizationId: "org_1",
      slug: contractId,
      status: "ACTIVE",
    };
  }),
}));

vi.mock("./prisma", () => ({
  prisma: {
    appView: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    entityType: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const appViewCreate = vi.mocked(prisma.appView.create);
const appViewFindFirst = vi.mocked(prisma.appView.findFirst);
const appViewFindMany = vi.mocked(prisma.appView.findMany);
const appViewUpdate = vi.mocked(prisma.appView.update);
const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityTypeFindMany = vi.mocked(prisma.entityType.findMany);

function entityType(overrides: Record<string, unknown> = {}) {
  return {
    fields: [
      { id: "field_estado", isActive: true, key: "estado", multiple: false, name: "Estado", type: "SELECT" },
      { id: "field_cerrado", isActive: false, key: "cerrado", multiple: false, name: "Cerrado", type: "BOOLEAN" },
    ],
    id: "entity_1",
    name: "Personas",
    ...overrides,
  };
}

function formData(overrides: Record<string, string | string[] | boolean | number | null> = {}) {
  const form = new FormData();
  const values = {
    active: true,
    entityTypeId: "entity_1",
    icon: "",
    name: "Directorio Personas",
    slug: "directorio-personas",
    sortOrder: 0,
    type: "RECORDS",
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        form.append(key, item);
      }
      continue;
    }

    if (typeof value === "boolean") {
      if (value) {
        form.set(key, "on");
      }
      continue;
    }

    form.set(key, String(value));
  }

  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  appViewCreate.mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: "view_1",
    ...args.data,
  })) as never);
  appViewFindFirst.mockResolvedValue({
    active: true,
    config: { entityTypeId: "entity_1" },
    contractId: "contract_1",
    id: "view_1",
    icon: null,
    name: "Vista",
    slug: "vista",
    sortOrder: 0,
    type: "RECORDS",
  } as never);
  appViewFindMany.mockResolvedValue([] as never);
  appViewUpdate.mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: "view_1",
    ...args.data,
  })) as never);
  entityTypeFindFirst.mockResolvedValue(entityType() as never);
  entityTypeFindMany.mockResolvedValue([entityType()] as never);
});

describe("AppView config validation", () => {
  it("creates a valid RECORDS view", async () => {
    await createAppView("contract_1", "user_1", getAppViewInput(formData()));

    expect(entityTypeFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contractId: "contract_1", id: "entity_1" }),
    }));
    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        config: { entityTypeId: "entity_1" },
        type: "RECORDS",
      }),
    }));
  });

  it("rejects RECORDS with an entity from another contract", async () => {
    entityTypeFindFirst.mockResolvedValueOnce(null);

    await expect(
      createAppView("contract_1", "user_1", getAppViewInput(formData())),
    ).rejects.toThrow("La vista referencia una entidad que no pertenece a este contrato.");
  });

  it("creates a valid WORKFLOW view", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType() as never);

    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        sourceEntityTypeId: "people",
        targetEntityTypeId: "attendance",
        personFieldId: "person_field",
        dateFieldId: "date_field",
        statusFieldId: "status_field",
        defaultCheckInOptionId: "present_option",
        contextFieldIds: ["shift_field", "sector_field", "shift_field"],
        observationFieldId: "observation_field",
        type: "WORKFLOW",
        workflowKey: "attendance",
      })),
    );

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        config: {
          workflowKey: "attendance",
          sourceEntityTypeId: "people",
          targetEntityTypeId: "attendance",
          personFieldId: "person_field",
          dateFieldId: "date_field",
          statusFieldId: "status_field",
          defaultCheckInOptionId: "present_option",
          contextFieldIds: ["shift_field", "sector_field"],
          observationFieldId: "observation_field",
        },
        type: "WORKFLOW",
      }),
    }));
  });

  it("rejects WORKFLOW source or target from another contract", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(null);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          sourceEntityTypeId: "people",
          targetEntityTypeId: "foreign",
          personFieldId: "person_field",
          dateFieldId: "date_field",
          statusFieldId: "status_field",
          defaultCheckInOptionId: "present_option",
          type: "WORKFLOW",
          workflowKey: "attendance",
        })),
      ),
    ).rejects.toThrow("La vista referencia una entidad que no pertenece a este contrato.");
  });

  it("rejects attendance context fields that repeat semantic fields", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType() as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          sourceEntityTypeId: "people",
          targetEntityTypeId: "attendance",
          personFieldId: "person_field",
          dateFieldId: "date_field",
          statusFieldId: "status_field",
          defaultCheckInOptionId: "present_option",
          contextFieldIds: ["status_field"],
          type: "WORKFLOW",
          workflowKey: "attendance",
        })),
      ),
    ).rejects.toThrow("Los campos de contexto no deben repetir Persona, Fecha, Estado ni Observación.");
  });

  it("rejects an unsupported workflowKey", async () => {
    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "date_field",
          personFieldId: "person_field",
          defaultCheckInOptionId: "present_option",
          sourceEntityTypeId: "people",
          statusFieldId: "status_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "inspection",
        })),
      ),
    ).rejects.toThrow();
  });

  it("rejects attendance when configured field types are incorrect", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType({
        fields: [
          {
            config: { targetEntityTypeId: "people", relationKind: "ONE" },
            id: "person_field",
            isActive: true,
            key: "persona",
            name: "Persona",
            options: [],
            type: "TEXT",
          },
          {
            config: null,
            id: "date_field",
            isActive: true,
            key: "fecha",
            name: "Fecha",
            options: [],
            type: "DATE",
          },
          {
            config: null,
            id: "status_field",
            isActive: true,
            key: "estado",
            name: "Estado",
            options: [
              { isActive: true, value: "PRESENTE" },
              { isActive: true, value: "AUSENTE" },
            ],
            type: "SELECT",
          },
        ],
      }) as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "date_field",
          personFieldId: "person_field",
          defaultCheckInOptionId: "present_option",
          sourceEntityTypeId: "people",
          statusFieldId: "status_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "attendance",
        })),
      ),
    ).rejects.toThrow("El campo Persona debe ser de tipo relación.");
  });

  it("rejects attendance when the relation points to a different source", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType({
        fields: [
          {
            config: { targetEntityTypeId: "equipment", relationKind: "ONE" },
            id: "person_field",
            isActive: true,
            key: "persona",
            name: "Persona",
            options: [],
            type: "RELATION",
          },
          {
            config: null,
            id: "date_field",
            isActive: true,
            key: "fecha",
            name: "Fecha",
            options: [],
            type: "DATE",
          },
          {
            config: null,
            id: "status_field",
            isActive: true,
            key: "estado",
            name: "Estado",
            options: [
              { id: "present_option", isActive: true, value: "PRESENTE" },
              { id: "absent_option", isActive: true, value: "AUSENTE" },
            ],
            type: "SELECT",
          },
        ],
      }) as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "date_field",
          personFieldId: "person_field",
          defaultCheckInOptionId: "present_option",
          sourceEntityTypeId: "people",
          statusFieldId: "status_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "attendance",
        })),
      ),
    ).rejects.toThrow("Este campo debe relacionar Asistencias con Personas.");
  });

  it("accepts attendance relation config saved under a nested relation key", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType({
        fields: [
          attendanceField("person_field", "RELATION", {
            config: { relation: { targetEntityTypeId: "people", relationKind: "ONE" } },
          }),
          attendanceField("date_field", "DATE"),
          attendanceField("status_field", "SELECT", { options: attendanceStatusOptions() }),
        ],
      }) as never);

    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        dateFieldId: "date_field",
        personFieldId: "person_field",
        defaultCheckInOptionId: "present_option",
        sourceEntityTypeId: "people",
        statusFieldId: "status_field",
        targetEntityTypeId: "attendance",
        type: "WORKFLOW",
        workflowKey: "attendance",
      })),
    );

    expect(appViewCreate).toHaveBeenCalled();
  });

  it("accepts attendance status with additional options", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType({
        fields: [
          attendanceField("person_field", "RELATION"),
          attendanceField("date_field", "DATE"),
          attendanceField("status_field", "SELECT", {
            options: [
              ...attendanceStatusOptions(),
              { id: "late_option", isActive: true, value: "atraso" },
              { id: "leave_option", isActive: true, value: "permiso" },
              { id: "vacation_option", isActive: true, value: "vacaciones" },
            ],
          }),
        ],
      }) as never);

    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        dateFieldId: "date_field",
        personFieldId: "person_field",
        defaultCheckInOptionId: "present_option",
        sourceEntityTypeId: "people",
        statusFieldId: "status_field",
        targetEntityTypeId: "attendance",
        type: "WORKFLOW",
        workflowKey: "attendance",
      })),
    );

    expect(appViewCreate).toHaveBeenCalled();
  });

  it("accepts attendance status options with lowercase values", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType({
        fields: [
          attendanceField("person_field", "RELATION"),
          attendanceField("date_field", "DATE"),
          attendanceField("status_field", "SELECT", {
            options: [
              { id: "present_option", isActive: true, value: "presente" },
              { id: "absent_option", isActive: true, value: "ausente" },
            ],
          }),
        ],
      }) as never);

    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        dateFieldId: "date_field",
        personFieldId: "person_field",
        defaultCheckInOptionId: "present_option",
        sourceEntityTypeId: "people",
        statusFieldId: "status_field",
        targetEntityTypeId: "attendance",
        type: "WORKFLOW",
        workflowKey: "attendance",
      })),
    );

    expect(appViewCreate).toHaveBeenCalled();
  });

  it("accepts attendance status options with arbitrary values", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType({
        fields: [
          attendanceField("person_field", "RELATION"),
          attendanceField("date_field", "DATE"),
          attendanceField("status_field", "SELECT", {
            options: [
              { id: "present_option", isActive: true, value: "P" },
              { id: "absent_option", isActive: true, value: "A" },
            ],
          }),
        ],
      }) as never);

    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        dateFieldId: "date_field",
        personFieldId: "person_field",
        defaultCheckInOptionId: "present_option",
        sourceEntityTypeId: "people",
        statusFieldId: "status_field",
        targetEntityTypeId: "attendance",
        type: "WORKFLOW",
        workflowKey: "attendance",
      })),
    );

    expect(appViewCreate).toHaveBeenCalled();
  });

  it("rejects attendance when an option id belongs to another field", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType() as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "date_field",
          personFieldId: "person_field",
          defaultCheckInOptionId: "foreign_option",
          sourceEntityTypeId: "people",
          statusFieldId: "status_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "attendance",
        })),
      ),
    ).rejects.toThrow("El estado por defecto de checking debe pertenecer al campo Estado y estar activo.");
  });

  it("rejects attendance when an option id is inactive", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType({
        fields: [
          attendanceField("person_field", "RELATION"),
          attendanceField("date_field", "DATE"),
          attendanceField("status_field", "SELECT", {
            options: [
              { id: "present_option", isActive: false, value: "presente" },
              { id: "absent_option", isActive: true, value: "ausente" },
            ],
          }),
        ],
      }) as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "date_field",
          personFieldId: "person_field",
          defaultCheckInOptionId: "present_option",
          sourceEntityTypeId: "people",
          statusFieldId: "status_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "attendance",
        })),
      ),
    ).rejects.toThrow("El estado por defecto de checking debe pertenecer al campo Estado y estar activo.");
  });

  it("accepts attendance with one configured default check-in option", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType() as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "date_field",
          personFieldId: "person_field",
          defaultCheckInOptionId: "present_option",
          sourceEntityTypeId: "people",
          statusFieldId: "status_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "attendance",
        })),
      ),
    ).resolves.toBeTruthy();
  });

  it("rejects attendance status when the select allows multiple values", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "people" }) as never)
      .mockResolvedValueOnce(attendanceEntityType({
        fields: [
          attendanceField("person_field", "RELATION"),
          attendanceField("date_field", "DATE"),
          attendanceField("status_field", "SELECT", {
            multiple: true,
            options: attendanceStatusOptions(),
          }),
        ],
      }) as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "date_field",
          personFieldId: "person_field",
          defaultCheckInOptionId: "present_option",
          sourceEntityTypeId: "people",
          statusFieldId: "status_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "attendance",
        })),
      ),
    ).rejects.toThrow("El campo Estado debe ser de selección simple.");
  });

  it("creates a valid state-update workflow with multiple state fields", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "equipment", name: "Equipos" }) as never)
      .mockResolvedValueOnce(stateUpdateEntityType() as never);

    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        dateFieldId: "date_field",
        extraFieldIds: ["observation_field", "cost_field"],
        historyMode: "update-current",
        requiredStateFieldIds: ["status_field"],
        sourceEntityTypeId: "equipment",
        "stateFieldDefaultOptionId:status_field": "present_option",
        stateFieldIds: ["status_field", "availability_field"],
        subjectFieldId: "person_field",
        targetEntityTypeId: "attendance",
        type: "WORKFLOW",
        uniquenessMode: "subject-date",
        workflowKey: "state-update",
      })),
    );

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        config: {
          workflowKey: "state-update",
          sourceEntityTypeId: "equipment",
          targetEntityTypeId: "attendance",
          subjectFieldId: "person_field",
          stateFields: [
            { fieldId: "status_field", required: true, defaultOptionId: "present_option" },
            { fieldId: "availability_field", required: false, defaultOptionId: undefined },
          ],
          extraFieldIds: ["observation_field", "cost_field"],
          dateFieldId: "date_field",
          uniqueness: { mode: "subject-date" },
          historyMode: "update-current",
        },
        type: "WORKFLOW",
      }),
    }));
  });

  it.each([
    ["TEXT", "text_state"],
    ["INTEGER", "integer_state"],
    ["DECIMAL", "decimal_state"],
    ["MONEY", "money_state"],
    ["DATE", "date_state"],
    ["BOOLEAN", "boolean_state"],
  ])("creates a valid state-update workflow with %s as a state field", async (type, fieldId) => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "equipment", name: "Equipos" }) as never)
      .mockResolvedValueOnce(stateUpdateEntityType({
        fields: [
          attendanceField("person_field", "RELATION", {
            config: { targetEntityTypeId: "equipment", relationKind: "ONE" },
          }),
          attendanceField("status_field", "SELECT", { options: attendanceStatusOptions() }),
          attendanceField(fieldId, type),
        ],
      }) as never);

    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        sourceEntityTypeId: "equipment",
        stateFieldIds: ["status_field", fieldId],
        subjectFieldId: "person_field",
        targetEntityTypeId: "attendance",
        type: "WORKFLOW",
        workflowKey: "state-update",
      })),
    );

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        config: expect.objectContaining({
          stateFields: [
            { fieldId: "status_field", required: false, defaultOptionId: undefined },
            { fieldId, required: false, defaultOptionId: undefined },
          ],
        }),
      }),
    }));
  });

  it.each([
    ["RELATION"],
    ["MULTISELECT"],
  ])("rejects state-update when a state field is %s", async (type) => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "equipment", name: "Equipos" }) as never)
      .mockResolvedValueOnce(stateUpdateEntityType({
        fields: [
          attendanceField("person_field", "RELATION", {
            config: { targetEntityTypeId: "equipment", relationKind: "ONE" },
          }),
          attendanceField("date_field", "DATE"),
          attendanceField("status_field", type, type === "MULTISELECT"
            ? { options: attendanceStatusOptions() }
            : {}),
        ],
      }) as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          sourceEntityTypeId: "equipment",
          stateFieldIds: ["status_field"],
          subjectFieldId: "person_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "state-update",
        })),
      ),
    ).rejects.toThrow("Ese tipo de campo de estado no está soportado.");
  });

  it("rejects state-update defaultOptionId for non SELECT state fields", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "equipment", name: "Equipos" }) as never)
      .mockResolvedValueOnce(stateUpdateEntityType({
        fields: [
          attendanceField("person_field", "RELATION", {
            config: { targetEntityTypeId: "equipment", relationKind: "ONE" },
          }),
          attendanceField("revision_field", "TEXT"),
        ],
      }) as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          sourceEntityTypeId: "equipment",
          "stateFieldDefaultOptionId:revision_field": "present_option",
          stateFieldIds: ["revision_field"],
          subjectFieldId: "person_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "state-update",
        })),
      ),
    ).rejects.toThrow("La opción por defecto solo aplica a campos de estado SELECT.");
  });

  it("rejects state-update when an extra field repeats a state field", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "equipment", name: "Equipos" }) as never)
      .mockResolvedValueOnce(stateUpdateEntityType() as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          extraFieldIds: ["status_field"],
          sourceEntityTypeId: "equipment",
          stateFieldIds: ["status_field"],
          subjectFieldId: "person_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "state-update",
        })),
      ),
    ).rejects.toThrow("Los campos extra no deben repetir sujeto, fecha ni estados.");
  });

  it("rejects state-update when the subject relation points elsewhere", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "equipment", name: "Equipos" }) as never)
      .mockResolvedValueOnce(stateUpdateEntityType({
        fields: [
          attendanceField("person_field", "RELATION", {
            config: { targetEntityTypeId: "people", relationKind: "ONE" },
          }),
          attendanceField("status_field", "SELECT", { options: attendanceStatusOptions() }),
        ],
      }) as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          sourceEntityTypeId: "equipment",
          stateFieldIds: ["status_field"],
          subjectFieldId: "person_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "state-update",
        })),
      ),
    ).rejects.toThrow("El campo sujeto debe relacionar con Equipos.");
  });

  it("rejects state-update when an extra field is outside the target", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "equipment", name: "Equipos" }) as never)
      .mockResolvedValueOnce(stateUpdateEntityType() as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          extraFieldIds: ["foreign_field"],
          sourceEntityTypeId: "equipment",
          stateFieldIds: ["status_field"],
          subjectFieldId: "person_field",
          targetEntityTypeId: "attendance",
          type: "WORKFLOW",
          workflowKey: "state-update",
        })),
      ),
    ).rejects.toThrow("Selecciona un campo activo válido para Campo extra.");
  });

  it("creates a valid REPORT TABLE view", async () => {
    entityTypeFindFirst.mockResolvedValueOnce(attendanceEntityType() as never);

    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        dateFieldId: "date_field",
        defaultSortDirection: "desc",
        defaultSortFieldId: "date_field",
        entityTypeId: "attendance",
        presentationMode: "TABLE",
        reportTimeAllowChange: true,
        "reportValueDisplay:status_field": "INTERNAL_VALUE",
        type: "REPORT",
        visibleFieldIds: ["person_field", "date_field", "status_field", "person_field"],
      })),
    );

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        config: {
          entityTypeId: "attendance",
          dateFieldId: "date_field",
          timeFilter: {
            allowChange: true,
            defaultPeriod: "CURRENT_MONTH",
            mode: "RANGE",
          },
          valueDisplay: {
            status_field: "INTERNAL_VALUE",
          },
          presentationMode: "TABLE",
          table: {
            visibleFieldIds: ["person_field", "date_field", "status_field"],
            defaultSortFieldId: "date_field",
            defaultSortDirection: "desc",
          },
        },
        type: "REPORT",
      }),
    }));
  });

  it("creates a valid REPORT MATRIX view with optional summary", async () => {
    entityTypeFindFirst.mockResolvedValueOnce(attendanceEntityType() as never);

    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        dateFieldId: "date_field",
        entityTypeId: "attendance",
        presentationMode: "MATRIX",
        reportTimeAllowChange: false,
        reportTimeMode: "MONTH",
        reportTimeDefaultPeriod: "CURRENT_MONTH",
        reportColumnFieldId: "date_field",
        reportRowFieldId: "person_field",
        reportSummaryFieldId: "status_field",
        reportValueFieldId: "status_field",
        "reportValueDisplay:status_field": "LABEL",
        type: "REPORT",
      })),
    );

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        config: {
          entityTypeId: "attendance",
          dateFieldId: "date_field",
          timeFilter: {
            allowChange: false,
            defaultPeriod: "CURRENT_MONTH",
            mode: "MONTH",
          },
          valueDisplay: {
            status_field: "LABEL",
          },
          presentationMode: "MATRIX",
          matrix: {
            rowFieldId: "person_field",
            columnFieldId: "date_field",
            valueFieldId: "status_field",
            summaryFieldId: "status_field",
          },
        },
        type: "REPORT",
      }),
    }));
  });

  it("rejects REPORT when date field is not date compatible", async () => {
    entityTypeFindFirst.mockResolvedValueOnce(attendanceEntityType() as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "status_field",
          entityTypeId: "attendance",
          presentationMode: "TABLE",
          type: "REPORT",
          visibleFieldIds: ["person_field"],
        })),
      ),
    ).rejects.toThrow("El campo de fecha debe ser de tipo fecha.");
  });

  it("rejects REPORT MATRIX when a configured field is outside the entity", async () => {
    entityTypeFindFirst.mockResolvedValueOnce(attendanceEntityType() as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "date_field",
          entityTypeId: "attendance",
          presentationMode: "MATRIX",
          reportColumnFieldId: "date_field",
          reportRowFieldId: "foreign_field",
          reportValueFieldId: "status_field",
          type: "REPORT",
        })),
      ),
    ).rejects.toThrow("Selecciona un campo activo válido para Filas.");
  });

  it("rejects REPORT value display for non-select fields", async () => {
    entityTypeFindFirst.mockResolvedValueOnce(attendanceEntityType() as never);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({
          dateFieldId: "date_field",
          entityTypeId: "attendance",
          presentationMode: "TABLE",
          "reportValueDisplay:date_field": "INTERNAL_VALUE",
          type: "REPORT",
          visibleFieldIds: ["person_field", "date_field"],
        })),
      ),
    ).rejects.toThrow("La presentación de valores solo aplica a campos de selección.");
  });

  it("creates a valid BOARD view", async () => {
    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        groupByFieldKey: "estado",
        type: "BOARD",
      })),
    );

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        config: { entityTypeId: "entity_1", groupByFieldKey: "estado" },
        type: "BOARD",
      }),
    }));
  });

  it("rejects BOARD with a missing field", async () => {
    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({ groupByFieldKey: "missing", type: "BOARD" })),
      ),
    ).rejects.toThrow("Selecciona un campo activo válido para agrupar.");
  });

  it("rejects BOARD with an inactive field", async () => {
    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({ groupByFieldKey: "cerrado", type: "BOARD" })),
      ),
    ).rejects.toThrow("Selecciona un campo activo válido para agrupar.");
  });

  it("creates a valid DASHBOARD view", async () => {
    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({ entityTypeIds: ["entity_1", "entity_2"], type: "DASHBOARD" })),
    );

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        config: { entityTypeIds: ["entity_1", "entity_2"] },
        type: "DASHBOARD",
      }),
    }));
  });

  it("rejects DASHBOARD with an entity from another contract", async () => {
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType({ id: "entity_1" }) as never)
      .mockResolvedValueOnce(null);

    await expect(
      createAppView(
        "contract_1",
        "user_1",
        getAppViewInput(formData({ entityTypeIds: ["entity_1", "foreign"], type: "DASHBOARD" })),
      ),
    ).rejects.toThrow("La vista referencia una entidad que no pertenece a este contrato.");
  });
});

function attendanceEntityType(overrides: Record<string, unknown> = {}) {
  return entityType({
    fields: [
      attendanceField("person_field", "RELATION"),
      attendanceField("date_field", "DATE"),
      attendanceField("status_field", "SELECT", { options: attendanceStatusOptions() }),
      attendanceField("shift_field", "SELECT", { options: [{ id: "day_option", isActive: true, value: "day" }] }),
      attendanceField("sector_field", "SELECT", { options: [{ id: "north_option", isActive: true, value: "north" }] }),
      attendanceField("observation_field", "TEXTAREA"),
    ],
    id: "attendance",
    name: "Asistencias",
    ...overrides,
  });
}

function stateUpdateEntityType(overrides: Record<string, unknown> = {}) {
  return entityType({
    fields: [
      attendanceField("person_field", "RELATION", {
        config: { targetEntityTypeId: "equipment", relationKind: "ONE" },
      }),
      attendanceField("date_field", "DATE"),
      attendanceField("status_field", "SELECT", { options: attendanceStatusOptions() }),
      attendanceField("availability_field", "SELECT", {
        options: [
          { id: "available_option", isActive: true, value: "available" },
          { id: "unavailable_option", isActive: true, value: "unavailable" },
        ],
      }),
      attendanceField("observation_field", "TEXTAREA"),
      attendanceField("cost_field", "MONEY"),
    ],
    id: "attendance",
    name: "Estados",
    ...overrides,
  });
}

function attendanceField(
  id: string,
  type: string,
  overrides: Record<string, unknown> = {},
) {
  const names: Record<string, string> = {
    date_field: "Fecha",
    observation_field: "Observación",
    person_field: "Persona",
    status_field: "Estado",
  };
  const keys: Record<string, string> = {
    date_field: "fecha",
    observation_field: "observacion",
    person_field: "persona",
    status_field: "estado",
  };

  return {
    config: type === "RELATION" ? { targetEntityTypeId: "people", relationKind: "ONE" } : null,
    id,
    isActive: true,
    key: keys[id] ?? id,
    multiple: false,
    name: names[id] ?? id,
    options: [],
    type,
    ...overrides,
  };
}

function attendanceStatusOptions() {
  return [
    { id: "present_option", isActive: true, value: "PRESENTE" },
    { id: "absent_option", isActive: true, value: "AUSENTE" },
  ];
}

describe("AppView administration", () => {
  it("allows the same slug in another contract by relying on the scoped database unique key", async () => {
    await createAppView("contract_2", "user_1", getAppViewInput(formData()));

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        contractId: "contract_2",
        slug: "directorio-personas",
      }),
    }));
  });

  it("returns a clear message for duplicate slug inside one contract", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique failed", {
      clientVersion: "test",
      code: "P2002",
    });

    expect(friendlyAppViewError(error)).toBe("Ya existe una vista con ese slug en este contrato.");
  });

  it("persists active toggle and sortOrder", async () => {
    await updateAppView(
      "contract_1",
      "view_1",
      "user_1",
      getAppViewInput(formData({ active: null, sortOrder: 4 })),
    );
    await setAppViewActive("contract_1", "view_1", "user_1", false);

    expect(appViewUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ active: false, sortOrder: 4 }),
    }));
    expect(appViewUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: { active: false },
    }));
  });

  it("accepts valid icons and rejects invalid icons", async () => {
    await createAppView("contract_1", "user_1", getAppViewInput(formData({ icon: "clipboard-check" })));

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ icon: "clipboard-check" }),
    }));
    expect(() => getAppViewInput(formData({ icon: "script-tag" }))).toThrow();
  });

  it("blocks users without contract access", async () => {
    await expect(getAppViewAdminData("blocked_contract", "user_1")).resolves.toBeNull();
    await expect(
      createAppView("blocked_contract", "user_1", getAppViewInput(formData())),
    ).resolves.toBeNull();
  });

  it("blocks cross-tenant updates through the authorized AppView lookup", async () => {
    appViewFindFirst.mockResolvedValueOnce(null);

    await expect(
      updateAppView("contract_1", "foreign_view", "user_1", getAppViewInput(formData())),
    ).resolves.toBeNull();
  });

  it("parses stored JSON configs as typed DTOs", () => {
    expect(parseAppViewConfig({
      config: { entityTypeId: "entity_1" },
      type: "RECORDS",
    } as never)).toEqual({ entityTypeId: "entity_1", type: "RECORDS" });

    expect(parseAppViewConfig({
      config: {
        entityTypeId: "attendance",
        dateFieldId: "date_field",
        timeFilter: {
          allowChange: true,
          defaultPeriod: "CURRENT_MONTH",
          mode: "MONTH",
        },
        presentationMode: "MATRIX",
        matrix: {
          columnFieldId: "date_field",
          rowFieldId: "person_field",
          valueFieldId: "status_field",
        },
      },
      type: "REPORT",
    } as never)).toEqual({
      entityTypeId: "attendance",
      dateFieldId: "date_field",
      timeFilter: {
        allowChange: true,
        defaultPeriod: "CURRENT_MONTH",
        mode: "MONTH",
      },
      valueDisplay: {},
      presentationMode: "MATRIX",
      matrix: {
        columnFieldId: "date_field",
        rowFieldId: "person_field",
        valueFieldId: "status_field",
      },
      type: "REPORT",
    });

    expect(parseAppViewConfig({
      config: {
        entityTypeId: "attendance",
        dateFieldId: "date_field",
        presentationMode: "TABLE",
        table: {
          visibleFieldIds: ["person_field"],
          defaultSortDirection: "asc",
        },
      },
      type: "REPORT",
    } as never)).toMatchObject({
      timeFilter: {
        allowChange: true,
        defaultPeriod: "CURRENT_MONTH",
        mode: "RANGE",
      },
      valueDisplay: {},
      type: "REPORT",
    });
  });
});
