import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { getIncomingRecordRelationsPage } from "@/lib/entity-records";

import EntityRecordRelationsPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/entity-records", () => ({
  getIncomingRecordRelationsPage: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getIncomingRecordRelationsPageMock = vi.mocked(getIncomingRecordRelationsPage);

describe("entity record incoming relations page", () => {
  it("renders a paginated list with source record links and target context", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
    getIncomingRecordRelationsPageMock.mockResolvedValue({
      record: { id: "department_1", displayName: "Operaciones" },
      sourceEntityType: { id: "people", name: "Personas" },
      sourceField: { id: "department", name: "Departamento" },
      pagination: {
        page: 2,
        pageSize: 25,
        totalRecords: 52,
        totalPages: 3,
      },
      query: "ana",
      records: [
        { id: "person_26", displayName: "Ana Norte" },
        { id: "person_27", displayName: "Ana Sur" },
      ],
    } as never);

    const html = renderToStaticMarkup(
      await EntityRecordRelationsPage({
        params: Promise.resolve({
          contractId: "contract_1",
          entityTypeId: "departments",
          recordId: "department_1",
        }),
        searchParams: Promise.resolve({
          page: "2",
          q: "ana",
          sourceEntityTypeId: "people",
          sourceFieldId: "department",
        }),
      }),
    );

    expect(getIncomingRecordRelationsPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: "contract_1",
        entityTypeId: "departments",
        recordId: "department_1",
        sourceEntityTypeId: "people",
        sourceFieldId: "department",
        page: 2,
        pageSize: 25,
        query: "ana",
        userId: "user_1",
      }),
    );
    expect(html).toContain("Personas · Departamento");
    expect(html).toContain("Apuntan hacia Operaciones");
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/departments/department_1"',
    );
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/people/person_26"',
    );
    expect(html).toContain("Página 2 de 3 · 52 registros");
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/departments/department_1/relations?sourceEntityTypeId=people&amp;sourceFieldId=department&amp;q=ana"',
    );
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/departments/department_1/relations?sourceEntityTypeId=people&amp;sourceFieldId=department&amp;q=ana&amp;page=3"',
    );
  });
});
