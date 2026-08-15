import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEntityType,
  getEntityTypeInput,
  updateEntityType,
} from "./entity-config";
import { prisma } from "./prisma";

vi.mock("./contracts", () => ({
  getAuthorizedContract: vi.fn(async () => ({
    code: "CON",
    description: null,
    id: "contract_1",
    name: "Contrato",
    organizationId: "org_1",
    slug: "contrato",
    status: "ACTIVE",
  })),
}));

vi.mock("./prisma", () => ({
  prisma: {
    entityType: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const entityTypeCreate = vi.mocked(prisma.entityType.create);
const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityTypeUpdate = vi.mocked(prisma.entityType.update);

function formData(icon?: string, nature?: string) {
  const form = new FormData();

  form.set("name", "Equipos");
  form.set("slug", "equipos");
  form.set("isActive", "true");

  if (icon !== undefined) {
    form.set("icon", icon);
  }

  if (nature !== undefined) {
    form.set("nature", nature);
  }

  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  entityTypeCreate.mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: "entity_created",
    ...args.data,
  })) as never);
  entityTypeFindFirst.mockResolvedValue({ id: "entity_1" } as never);
  entityTypeUpdate.mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: "entity_1",
    ...args.data,
  })) as never);
});

describe("entity type icon input", () => {
  it("parses missing icon as optional", () => {
    expect(getEntityTypeInput(formData())).toMatchObject({
      icon: undefined,
      name: "Equipos",
    });
  });

  it("parses empty icon as optional", () => {
    expect(getEntityTypeInput(formData(""))).toMatchObject({
      icon: undefined,
    });
  });

  it("accepts valid catalog icons", () => {
    expect(getEntityTypeInput(formData("warehouse"))).toMatchObject({
      icon: "warehouse",
    });
  });

  it("rejects icons outside the catalog", () => {
    expect(() => getEntityTypeInput(formData("script-tag"))).toThrow();
  });
});

describe("entity type nature input", () => {
  it("defaults missing nature to MASTER", () => {
    expect(getEntityTypeInput(formData())).toMatchObject({
      nature: "MASTER",
    });
  });

  it("accepts the supported entity natures", () => {
    expect(getEntityTypeInput(formData(undefined, "MASTER"))).toMatchObject({
      nature: "MASTER",
    });
    expect(getEntityTypeInput(formData(undefined, "TRANSACTION"))).toMatchObject({
      nature: "TRANSACTION",
    });
    expect(getEntityTypeInput(formData(undefined, "REFERENCE"))).toMatchObject({
      nature: "REFERENCE",
    });
  });

  it("rejects unsupported entity natures", () => {
    expect(() => getEntityTypeInput(formData(undefined, "VIEW"))).toThrow();
  });
});

describe("entity type icon persistence", () => {
  it("creates EntityType without icon as null", async () => {
    await createEntityType("contract_1", "user_1", getEntityTypeInput(formData()));

    expect(entityTypeCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ icon: null }),
    }));
  });

  it("creates EntityType with a valid icon", async () => {
    await createEntityType("contract_1", "user_1", getEntityTypeInput(formData("warehouse")));

    expect(entityTypeCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ icon: "warehouse" }),
    }));
  });

  it("edits, changes and removes EntityType icon", async () => {
    await updateEntityType("contract_1", "entity_1", "user_1", getEntityTypeInput(formData("truck")));
    await updateEntityType("contract_1", "entity_1", "user_1", getEntityTypeInput(formData("factory")));
    await updateEntityType("contract_1", "entity_1", "user_1", getEntityTypeInput(formData("")));

    expect(entityTypeUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ icon: "truck" }),
    }));
    expect(entityTypeUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ icon: "factory" }),
    }));
    expect(entityTypeUpdate).toHaveBeenNthCalledWith(3, expect.objectContaining({
      data: expect.objectContaining({ icon: null }),
    }));
  });
});

describe("entity type nature persistence", () => {
  it("creates EntityType with default MASTER nature", async () => {
    await createEntityType("contract_1", "user_1", getEntityTypeInput(formData()));

    expect(entityTypeCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nature: "MASTER" }),
    }));
  });

  it("creates EntityType with an explicit nature", async () => {
    await createEntityType("contract_1", "user_1", getEntityTypeInput(formData(undefined, "TRANSACTION")));

    expect(entityTypeCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nature: "TRANSACTION" }),
    }));
  });

  it("edits EntityType nature", async () => {
    await updateEntityType("contract_1", "entity_1", "user_1", getEntityTypeInput(formData(undefined, "REFERENCE")));

    expect(entityTypeUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nature: "REFERENCE" }),
    }));
  });
});
