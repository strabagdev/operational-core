import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import {
  buildValueChanges,
  getContractActivity,
  getRecordAuditHistory,
  serializeAuditValue,
} from "./audit";
import { prisma } from "./prisma";

const mocks = vi.hoisted(() => ({
  getAuthorizedContract: vi.fn(),
}));

vi.mock("./contracts", () => ({
  getAuthorizedContract: mocks.getAuthorizedContract,
}));

vi.mock("./prisma", () => ({
  prisma: {
    auditEvent: {
      findMany: vi.fn(),
    },
    entityRecord: {
      findFirst: vi.fn(),
    },
  },
}));

const auditEventFindMany = vi.mocked(prisma.auditEvent.findMany);
const entityRecordFindFirst = vi.mocked(prisma.entityRecord.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthorizedContract.mockResolvedValue({
    id: "contract_1",
    organizationId: "org_1",
    name: "Contrato",
    code: "CON",
    status: "ACTIVE",
    slug: "contrato",
    organization: { id: "org_1", name: "Org" },
  });
  auditEventFindMany.mockResolvedValue([]);
  entityRecordFindFirst.mockResolvedValue({ id: "record_1" } as never);
});

describe("audit value serialization", () => {
  it("serializes decimal, money, date-only, select and multiselect values stably", () => {
    expect(serializeAuditValue({ decimalValue: new Prisma.Decimal("5269808713.45") })).toBe(
      "5269808713.45",
    );
    expect(serializeAuditValue({ dateValue: new Date("2026-01-21T00:00:00.000Z") })).toBe(
      "2026-01-21T00:00:00.000Z",
    );
    expect(serializeAuditValue({ textValue: "aprobado" })).toBe("aprobado");
    expect(serializeAuditValue({ jsonValue: ["operativo", "aprobado"] })).toEqual([
      "operativo",
      "aprobado",
    ]);
  });

  it("records field id, field name, before and after only when values change", () => {
    const changes = buildValueChanges({
      fields: [
        { id: "field_money", name: "Monto" },
        { id: "field_estado", name: "Estado" },
      ],
      oldValues: [
        { entityFieldId: "field_money", decimalValue: new Prisma.Decimal("10") },
        { entityFieldId: "field_estado", textValue: "pendiente" },
      ],
      newValues: [
        { fieldId: "field_money", decimalValue: new Prisma.Decimal("10") },
        { fieldId: "field_estado", textValue: "aprobado" },
      ],
    });

    expect(changes).toEqual([
      {
        entityFieldId: "field_estado",
        fieldName: "Estado",
        oldValue: "pendiente",
        newValue: "aprobado",
      },
    ]);
  });
});

describe("audit history scoping", () => {
  it("lists contract activity only for the authorized contract, newest first", async () => {
    await getContractActivity("contract_1", "user_1", 2);

    expect(mocks.getAuthorizedContract).toHaveBeenCalledWith("contract_1", "user_1");
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contractId: "contract_1" },
        orderBy: { createdAt: "desc" },
        skip: 25,
        take: 26,
      }),
    );
  });

  it("rejects activity for contracts outside the user membership", async () => {
    mocks.getAuthorizedContract.mockResolvedValueOnce(null);

    await expect(getContractActivity("foreign_contract", "user_1")).resolves.toBeNull();

    expect(auditEventFindMany).not.toHaveBeenCalled();
  });

  it("loads record history only after authorizing contract and record scope", async () => {
    await getRecordAuditHistory("contract_1", "entity_1", "record_1", "user_1");

    expect(entityRecordFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "record_1",
          entityTypeId: "entity_1",
          entityType: {
            contractId: "contract_1",
          },
        },
      }),
    );
    expect(auditEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          contractId: "contract_1",
          entityRecordId: "record_1",
        },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("does not leak history for records outside the authorized entity type or contract", async () => {
    entityRecordFindFirst.mockResolvedValueOnce(null);

    await expect(
      getRecordAuditHistory("contract_1", "entity_1", "foreign_record", "user_1"),
    ).resolves.toBeNull();

    expect(auditEventFindMany).not.toHaveBeenCalled();
  });
});
