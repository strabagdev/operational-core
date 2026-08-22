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
  getAuthorizedContract: vi.fn(async (contractId: string) => {
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
      attendanceField("observation_field", "TEXTAREA"),
    ],
    id: "attendance",
    name: "Asistencias",
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
  });
});
