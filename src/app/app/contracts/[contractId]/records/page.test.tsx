import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { getRecordEntityTypes } from "@/lib/entity-records";

import RecordsPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/entity-records", () => ({
  getRecordEntityTypes: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getRecordEntityTypesMock = vi.mocked(getRecordEntityTypes);

describe("RecordsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
  });

  it("keeps entity grouping, links, icons and record metadata", async () => {
    getRecordEntityTypesMock.mockResolvedValue({
      entityTypes: [
        {
          _count: { records: 4 },
          description: "Catálogo principal",
          icon: "warehouse",
          id: "entity_master",
          name: "Bodega central con nombre muy largo",
          nature: "MASTER",
        },
        {
          _count: { records: 8 },
          description: "Movimientos históricos",
          icon: "clipboard-check",
          id: "entity_transaction",
          name: "Versionado",
          nature: "TRANSACTION",
        },
      ],
    } as never);

    const html = renderToStaticMarkup(await RecordsPage({
      params: Promise.resolve({ contractId: "contract_1" }),
    }));

    expect(html).toContain("Registros");
    expect(html).toContain("Maestras");
    expect(html).toContain("Transaccionales");
    expect(html).toContain("Bodega central con nombre muy largo");
    expect(html).toContain("Versionado");
    expect(html).toContain("Catálogo principal");
    expect(html).toContain("Movimientos históricos");
    expect(html).toContain("Maestra");
    expect(html).toContain("Transaccional");
    expect(html).toContain("Registros");
    expect(html).toContain("4");
    expect(html).toContain("8");
    expect(html).toContain("/app/contracts/contract_1/records/entity_master");
    expect(html).toContain("/app/contracts/contract_1/records/entity_transaction");
    expect(html).toContain(">Abrir</a>");
    expect(html).toContain("<svg");
    expect(html).toContain('data-summary-card="true"');
    expect(html).toContain('data-summary-card-actions="true"');
    expect(html).toContain("min-w-0 flex-1");
  });

  it("renders a consistent empty state", async () => {
    getRecordEntityTypesMock.mockResolvedValue({ entityTypes: [] } as never);

    const html = renderToStaticMarkup(await RecordsPage({
      params: Promise.resolve({ contractId: "contract_1" }),
    }));

    expect(html).toContain("No hay tipos de entidad activos para registrar.");
    expect(html).toContain('data-empty-state="true"');
  });
});
