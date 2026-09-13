import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { getContractEntityTypes } from "@/lib/entity-config";

import EntityTypesPage from "./page";

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

vi.mock("@/lib/entity-config", () => ({
  getContractEntityTypes: vi.fn(),
}));

vi.mock("./actions", () => ({
  toggleEntityTypeAction: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getContractEntityTypesMock = vi.mocked(getContractEntityTypes);

describe("EntityTypesPage visual layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
  });

  it("keeps entity information, icons, actions and contained card structure", async () => {
    getContractEntityTypesMock.mockResolvedValue({
      entityTypes: [
        {
          _count: { fields: 7 },
          icon: "warehouse",
          id: "entity_1",
          isActive: true,
          name: "Bodega central con un nombre muy largo para probar wrapping",
          nature: "REFERENCE",
          slug: "bodega-central-identificador-largo",
          updatedAt: new Date("2026-09-12T12:00:00.000Z"),
        },
        {
          _count: { fields: 3 },
          icon: "clipboard-check",
          id: "entity_2",
          isActive: false,
          name: "Versionado",
          nature: "TRANSACTION",
          slug: "versionado",
          updatedAt: new Date("2026-09-10T12:00:00.000Z"),
        },
      ],
    } as never);

    const html = renderToStaticMarkup(await EntityTypesPage({
      params: Promise.resolve({ contractId: "contract_1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Tipos de entidad");
    expect(html).toContain("Crear tipo");
    expect(html).toContain("/app/contracts/contract_1/settings/entities/new");
    expect(html).toContain("Bodega central con un nombre muy largo");
    expect(html).toContain("bodega-central-identificador-largo");
    expect(html).toContain("Referencia");
    expect(html).toContain("Transaccional");
    expect(html).toContain("Activo");
    expect(html).toContain("Inactivo");
    expect(html).toContain("Campos");
    expect(html).toContain("7");
    expect(html).toContain("/app/contracts/contract_1/settings/entities/entity_1");
    expect(html).toContain("Editar y configurar campos");
    expect(html).toContain("Desactivar");
    expect(html).toContain("Activar");
    expect(html).toContain("<svg");
    expect(html).toContain('data-summary-card="true"');
    expect(html).toContain('data-summary-card-actions="true"');
    expect(html).toContain("min-w-0 flex-1");
    expect(html).toContain("flex shrink-0 flex-wrap items-center gap-2");
  });

  it("renders errors and the empty state consistently", async () => {
    getContractEntityTypesMock.mockResolvedValue({ entityTypes: [] } as never);

    const html = renderToStaticMarkup(await EntityTypesPage({
      params: Promise.resolve({ contractId: "contract_1" }),
      searchParams: Promise.resolve({ error: "No fue posible cambiar el estado." }),
    }));

    expect(html).toContain("No fue posible cambiar el estado.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Todavía no hay tipos de entidad configurados.");
    expect(html).toContain('data-empty-state="true"');
    expect(html).toContain("/app/contracts/contract_1/settings/entities/new");
  });
});
