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
      { isActive: true, key: "estado", name: "Estado" },
      { isActive: false, key: "cerrado", name: "Cerrado" },
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
    await createAppView(
      "contract_1",
      "user_1",
      getAppViewInput(formData({
        sourceEntityTypeId: "people",
        targetEntityTypeId: "attendance",
        type: "WORKFLOW",
        workflow: "attendance",
      })),
    );

    expect(appViewCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        config: {
          sourceEntityTypeId: "people",
          targetEntityTypeId: "attendance",
          workflow: "attendance",
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
          type: "WORKFLOW",
          workflow: "attendance",
        })),
      ),
    ).rejects.toThrow("La vista referencia una entidad que no pertenece a este contrato.");
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
