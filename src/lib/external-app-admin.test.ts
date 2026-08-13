import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createExternalAppForAdmin,
  ExternalAppAdminError,
  generateExternalAppClientId,
  getExternalAppAdministration,
  getExternalAppFormInput,
  normalizeExternalAppSlug,
  setExternalAppActiveForAdmin,
  updateExternalAppForAdmin,
} from "./external-app-admin";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    externalApp: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
  },
}));

const externalAppCreate = vi.mocked(prisma.externalApp.create);
const externalAppFindFirst = vi.mocked(prisma.externalApp.findFirst);
const externalAppFindMany = vi.mocked(prisma.externalApp.findMany);
const externalAppUpdate = vi.mocked(prisma.externalApp.update);
const organizationFindFirst = vi.mocked(prisma.organization.findFirst);

function organization(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    id: "org_1",
    name: "Organizacion A",
    slug: "organizacion-a",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function externalApp(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    clientId: "opco_app_test_client",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    id: "app_1",
    name: "Bodega",
    organization: organization(),
    organizationId: "org_1",
    slug: "bodega",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  organizationFindFirst.mockResolvedValue(organization() as never);
  externalAppFindFirst.mockResolvedValue(null);
  externalAppFindMany.mockResolvedValue([] as never);
  externalAppCreate.mockResolvedValue(externalApp() as never);
  externalAppUpdate.mockResolvedValue(externalApp() as never);
});

describe("external app administration", () => {
  it("normalizes form input and slug values", () => {
    const formData = new FormData();
    formData.set("name", "  Bodega Norte  ");
    formData.set("slug", "  Bódega Norte!! ");
    formData.set("active", "on");

    expect(getExternalAppFormInput(formData)).toEqual({
      active: true,
      name: "Bodega Norte",
      slug: "Bódega Norte!!",
    });
    expect(normalizeExternalAppSlug("  Bódega Norte!! ")).toBe("bodega-norte");
  });

  it("generates non-secret random client identifiers server-side", () => {
    const first = generateExternalAppClientId();
    const second = generateExternalAppClientId();

    expect(first).toMatch(/^opco_app_[A-Za-z0-9_-]{32}$/);
    expect(second).toMatch(/^opco_app_[A-Za-z0-9_-]{32}$/);
    expect(first).not.toBe(second);
  });

  it("allows an ADMIN to list apps from their organization", async () => {
    externalAppFindMany.mockResolvedValueOnce([
      externalApp({ id: "app_1", name: "Bodega" }),
    ] as never);

    const result = await getExternalAppAdministration("admin_1");

    expect(result.organization).toMatchObject({ id: "org_1" });
    expect(result.apps).toHaveLength(1);
    expect(organizationFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        memberships: {
          some: {
            role: "ADMIN",
            userId: "admin_1",
          },
        },
      },
    }));
    expect(externalAppFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: "org_1",
      },
    }));
  });

  it("returns no administration data for MEMBER users", async () => {
    organizationFindFirst.mockResolvedValueOnce(null);

    const result = await getExternalAppAdministration("member_1");

    expect(result).toEqual({ organization: null, apps: [] });
    expect(externalAppFindMany).not.toHaveBeenCalled();
  });

  it("creates an app using the server-side ADMIN organization", async () => {
    await createExternalAppForAdmin("admin_1", {
      active: true,
      name: "  Bodega  ",
      slug: "  Bódega  ",
    });

    expect(externalAppCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        active: true,
        clientId: expect.stringMatching(/^opco_app_[A-Za-z0-9_-]{32}$/),
        name: "Bodega",
        organizationId: "org_1",
        slug: "bodega",
      },
    }));
  });

  it("rejects duplicate slugs in the same organization", async () => {
    externalAppFindFirst.mockResolvedValueOnce({ id: "existing_app" } as never);

    await expect(createExternalAppForAdmin("admin_1", {
      active: true,
      name: "Bodega",
      slug: "bodega",
    })).rejects.toThrow(ExternalAppAdminError);
  });

  it("allows the same slug in different organizations by checking only the admin organization", async () => {
    organizationFindFirst.mockResolvedValueOnce(organization({
      id: "org_2",
      name: "Organizacion B",
    }) as never);

    await createExternalAppForAdmin("admin_2", {
      active: true,
      name: "Bodega",
      slug: "bodega",
    });

    expect(externalAppFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: "org_2",
        slug: "bodega",
      }),
    }));
    expect(externalAppCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org_2",
        slug: "bodega",
      }),
    }));
  });

  it("lets an ADMIN edit their app without moving it between organizations", async () => {
    externalAppFindFirst
      .mockResolvedValueOnce(externalApp() as never)
      .mockResolvedValueOnce(null);

    await updateExternalAppForAdmin("admin_1", "app_1", {
      active: false,
      name: "Bodega Sur",
      slug: "Bodega Sur",
    });

    expect(externalAppUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        active: false,
        name: "Bodega Sur",
        slug: "bodega-sur",
      },
      where: {
        id: "app_1",
      },
    }));
  });

  it("does not let an ADMIN edit an app from another organization", async () => {
    externalAppFindFirst.mockResolvedValueOnce(null);

    const result = await updateExternalAppForAdmin("admin_1", "foreign_app", {
      active: true,
      name: "Foreign",
      slug: "foreign",
    });

    expect(result).toBeNull();
    expect(externalAppUpdate).not.toHaveBeenCalled();
  });

  it("activates and deactivates without deleting the record", async () => {
    externalAppFindFirst.mockResolvedValueOnce(externalApp({ active: true }) as never);

    await setExternalAppActiveForAdmin("admin_1", "app_1", false);

    expect(externalAppUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        active: false,
      },
      where: {
        id: "app_1",
      },
    }));
    expect(prisma.externalApp).not.toHaveProperty("delete");
  });
});
