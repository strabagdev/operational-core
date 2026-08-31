import { beforeEach, describe, expect, it, vi } from "vitest";

import { signApiAccessToken } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appView: {
      findMany: vi.fn(),
    },
    contract: {
      findFirst: vi.fn(),
    },
    externalApp: {
      findUnique: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const appViewFindMany = vi.mocked(prisma.appView.findMany);
const contractFindFirst = vi.mocked(prisma.contract.findFirst);
const externalAppFindUnique = vi.mocked(prisma.externalApp.findUnique);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const membershipFindUnique = vi.mocked(prisma.membership.findUnique);
const userFindUnique = vi.mocked(prisma.user.findUnique);

const app = {
  clientId: "opco_app_client_1",
  id: "app_1",
  name: "Opco Client",
  slug: "opco-client",
};

async function apiRequest(path: string, userId = "user_1") {
  const token = await signApiAccessToken({
    app,
    user: {
      email: "user@example.com",
      id: userId,
      name: "User One",
    },
  });

  return new Request(`http://localhost${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function appView(overrides: Record<string, unknown> = {}) {
  return {
    config: { entityTypeId: "entity_1" },
    icon: "package",
    id: "view_1",
    name: "Materiales",
    slug: "materiales",
    sortOrder: 1,
    type: "RECORDS",
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_AUTH_SECRET = "test-api-auth-secret";
  userFindUnique.mockResolvedValue({
    email: "user@example.com",
    id: "user_1",
    name: "User One",
  } as never);
  membershipFindMany.mockResolvedValue([{ organizationId: "org_1" }] as never);
  membershipFindUnique.mockResolvedValue({ role: "MEMBER" } as never);
  externalAppFindUnique.mockResolvedValue({
    active: true,
    clientId: app.clientId,
    id: app.id,
    name: app.name,
    organizationId: "org_1",
    slug: app.slug,
  } as never);
  contractFindFirst.mockResolvedValue({
    id: "contract_1",
    name: "Contrato",
    organization: {
      id: "org_1",
      name: "Organización",
    },
    organizationId: "org_1",
  } as never);
  appViewFindMany.mockResolvedValue([appView()] as never);
});

describe("GET /api/v1/contracts/[contractId]/views", () => {
  it("returns only assigned active views serialized for the authenticated user", async () => {
    const response = await GET(
      await apiRequest("/api/v1/contracts/contract_1/views"),
      { params: Promise.resolve({ contractId: "contract_1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        views: [
          {
            config: { entityTypeId: "entity_1" },
            icon: "package",
            id: "view_1",
            name: "Materiales",
            slug: "materiales",
            sortOrder: 1,
            type: "RECORDS",
          },
        ],
      },
    });
    expect(appViewFindMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      where: {
        active: true,
        contractId: "contract_1",
        userAccesses: {
          some: {
            contractId: "contract_1",
            userId: "user_1",
          },
        },
      },
    }));
  });

  it("returns an empty list for users with no assigned views", async () => {
    appViewFindMany.mockResolvedValueOnce([] as never);

    const response = await GET(
      await apiRequest("/api/v1/contracts/contract_1/views"),
      { params: Promise.resolve({ contractId: "contract_1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { views: [] },
    });
  });

  it("serializes all supported config shapes", async () => {
    appViewFindMany.mockResolvedValueOnce([
      appView({ config: { entityTypeId: "records_entity" }, id: "records", type: "RECORDS" }),
      appView({
        config: {
          sourceEntityTypeId: "people",
          targetEntityTypeId: "attendance",
          workflowKey: "attendance",
          personFieldId: "person_field",
          dateFieldId: "date_field",
          statusFieldId: "status_field",
          defaultCheckInOptionId: "present_option",
        },
        id: "workflow",
        type: "WORKFLOW",
      }),
      appView({
        config: {
          sourceEntityTypeId: "equipment",
          targetEntityTypeId: "equipment_state",
          workflowKey: "state-update",
          subjectFieldId: "subject_field",
          stateFields: [
            { fieldId: "operational_field", required: true, defaultOptionId: "operational_ok" },
            { fieldId: "availability_field", required: false },
          ],
          extraFieldIds: ["observation_field"],
          dateFieldId: "date_field",
          uniqueness: { mode: "subject-date" },
          historyMode: "update-current",
        },
        id: "state-workflow",
        type: "WORKFLOW",
      }),
      appView({
        config: {
          entityTypeId: "attendance",
          dateFieldId: "date_field",
          presentationMode: "MATRIX",
          matrix: {
            rowFieldId: "person_field",
            columnFieldId: "date_field",
            valueFieldId: "status_field",
            summaryFieldId: "status_field",
          },
        },
        id: "report",
        type: "REPORT",
      }),
      appView({
        config: { entityTypeId: "board_entity", groupByFieldKey: "estado" },
        id: "board",
        type: "BOARD",
      }),
      appView({
        config: { entityTypeIds: ["a", "b"] },
        id: "dashboard",
        type: "DASHBOARD",
      }),
    ] as never);

    const response = await GET(
      await apiRequest("/api/v1/contracts/contract_1/views"),
      { params: Promise.resolve({ contractId: "contract_1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        views: [
          { config: { entityTypeId: "records_entity" }, type: "RECORDS" },
          {
            config: {
              sourceEntityTypeId: "people",
              targetEntityTypeId: "attendance",
              workflowKey: "attendance",
              personFieldId: "person_field",
              dateFieldId: "date_field",
              statusFieldId: "status_field",
              defaultCheckInOptionId: "present_option",
            },
            type: "WORKFLOW",
          },
          {
            config: {
              sourceEntityTypeId: "equipment",
              targetEntityTypeId: "equipment_state",
              workflowKey: "state-update",
              subjectFieldId: "subject_field",
              stateFields: [
                { fieldId: "operational_field", required: true, defaultOptionId: "operational_ok" },
                { fieldId: "availability_field", required: false },
              ],
              extraFieldIds: ["observation_field"],
              dateFieldId: "date_field",
              uniqueness: { mode: "subject-date" },
              historyMode: "update-current",
            },
            type: "WORKFLOW",
          },
          {
            config: {
              entityTypeId: "attendance",
              dateFieldId: "date_field",
              presentationMode: "MATRIX",
              matrix: {
                rowFieldId: "person_field",
                columnFieldId: "date_field",
                valueFieldId: "status_field",
                summaryFieldId: "status_field",
              },
            },
            type: "REPORT",
          },
          { config: { entityTypeId: "board_entity", groupByFieldKey: "estado" }, type: "BOARD" },
          { config: { entityTypeIds: ["a", "b"] }, type: "DASHBOARD" },
        ],
      },
      ok: true,
    });
  });

  it("omits views with invalid stored config instead of failing the whole endpoint", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    appViewFindMany.mockResolvedValueOnce([
      appView({ config: { entityTypeId: "entity_1" }, id: "valid" }),
      appView({ config: {}, id: "invalid" }),
    ] as never);

    const response = await GET(
      await apiRequest("/api/v1/contracts/contract_1/views"),
      { params: Promise.resolve({ contractId: "contract_1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.views).toHaveLength(1);
    expect(body.data.views[0].id).toBe("valid");
    expect(consoleError).toHaveBeenCalledWith(
      "Invalid AppView config omitted from API response.",
      expect.objectContaining({ appViewId: "invalid" }),
    );
    consoleError.mockRestore();
  });

  it("rejects a contract from another organization", async () => {
    membershipFindUnique.mockResolvedValueOnce(null);

    const response = await GET(
      await apiRequest("/api/v1/contracts/contract_1/views"),
      { params: Promise.resolve({ contractId: "contract_1" }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "CONTRACT_FORBIDDEN" },
      ok: false,
    });
    expect(appViewFindMany).not.toHaveBeenCalled();
  });

  it("rejects inactive external apps using the existing API policy", async () => {
    externalAppFindUnique.mockResolvedValueOnce({
      active: false,
      clientId: app.clientId,
      id: app.id,
      name: app.name,
      organizationId: "org_1",
      slug: app.slug,
    } as never);

    const response = await GET(
      await apiRequest("/api/v1/contracts/contract_1/views"),
      { params: Promise.resolve({ contractId: "contract_1" }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "TOKEN_APP_INACTIVE" },
      ok: false,
    });
  });
});
