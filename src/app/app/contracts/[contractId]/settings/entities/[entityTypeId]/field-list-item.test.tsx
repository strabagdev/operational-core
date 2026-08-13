import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FieldListItem } from "./field-list-item";

function field(overrides: Record<string, unknown> = {}) {
  return {
    id: String(overrides.id ?? "nombre"),
    key: String(overrides.key ?? "nombre"),
    name: String(overrides.name ?? "Nombre"),
    description: null,
    type: overrides.type ?? "TEXT",
    required: Boolean(overrides.required ?? false),
    isUnique: false,
    searchable: false,
    multiple: false,
    sortOrder: Number(overrides.sortOrder ?? 1),
    config: overrides.config ?? null,
    isActive: overrides.isActive ?? true,
    options: [],
    _count: { auditChanges: 0, relations: 0, values: 0 },
    ...overrides,
  } as never;
}

function renderFieldListItem({
  index,
  isLast,
  name = "Nombre",
}: {
  index: number;
  isLast: boolean;
  name?: string;
}) {
  return renderToStaticMarkup(
    <FieldListItem
      contractId="contract_1"
      entityTypeId="entity_1"
      entityTypes={[]}
      field={field({ id: name.toLowerCase(), key: name.toLowerCase(), name })}
      index={index}
      isLast={isLast}
      openHref="/app/contracts/contract_1/settings/entities/entity_1?fieldQ=rut&editField=nombre"
      deleteAction={() => {}}
      reorderAction={() => {}}
      returnTo="/app/contracts/contract_1/settings/entities/entity_1?fieldQ=rut&fieldType=TEXT"
      toggleAction={() => {}}
    />,
  );
}

describe("field list item order controls", () => {
  it("disables moving the first field up while keeping both buttons visible", () => {
    const html = renderFieldListItem({ index: 0, isLast: false });

    expect(html).toContain('aria-label="Mover Nombre hacia arriba"');
    expect(html).toContain('aria-label="Mover Nombre hacia abajo"');
    expect(html).toContain('aria-label="Mover Nombre hacia arriba" disabled=""');
    expect(html).not.toContain('aria-label="Mover Nombre hacia abajo" disabled=""');
  });

  it("disables moving the last field down while keeping both buttons visible", () => {
    const html = renderFieldListItem({ index: 2, isLast: true });

    expect(html).toContain('aria-label="Mover Nombre hacia arriba"');
    expect(html).toContain('aria-label="Mover Nombre hacia abajo" disabled=""');
    expect(html).not.toContain('aria-label="Mover Nombre hacia arriba" disabled=""');
  });

  it("enables both order buttons for an intermediate field", () => {
    const html = renderFieldListItem({ index: 1, isLast: false, name: "RUT" });

    expect(html).toContain('aria-label="Mover RUT hacia arriba"');
    expect(html).toContain('aria-label="Mover RUT hacia abajo"');
    expect(html).not.toContain('disabled=""');
  });

  it("does not duplicate order actions inside the contextual menu", () => {
    const html = renderFieldListItem({ index: 1, isLast: false });

    expect(html.match(/Mover Nombre hacia arriba/g)).toHaveLength(2);
    expect(html.match(/Mover Nombre hacia abajo/g)).toHaveLength(2);
    expect(html).not.toContain(">Subir<");
    expect(html).not.toContain(">Bajar<");
  });

  it("preserves current filters through the order form returnTo value", () => {
    const html = renderFieldListItem({ index: 1, isLast: false });

    expect(html).toContain('name="returnTo"');
    expect(html).toContain(
      'value="/app/contracts/contract_1/settings/entities/entity_1?fieldQ=rut&amp;fieldType=TEXT"',
    );
  });

});
