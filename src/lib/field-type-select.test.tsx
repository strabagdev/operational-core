import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { supportedEntityFieldTypes } from "./field-editor-state";
import { FieldTypeSelect } from "./field-type-select";

function renderFieldTypeSelect({
  disabled = false,
  type = "TEXT",
}: {
  disabled?: boolean;
  type?: (typeof supportedEntityFieldTypes)[number];
} = {}) {
  return renderToStaticMarkup(
    <FieldTypeSelect
      disabled={disabled}
      onChange={() => {}}
      setFirstErrorRef={() => {}}
      type={type}
    />,
  );
}

describe("field type select", () => {
  it("renders a visible create selector with all supported options", () => {
    const html = renderFieldTypeSelect();

    expect(html).toContain("Tipo de campo");
    expect(html).toContain("data-field-type-select=\"true\"");
    expect(html).toContain("name=\"type\"");
    expect(html).toContain("w-full");
    expect(html).toContain("text-foreground");
    expect(html).toContain("bg-background");

    for (const fieldType of supportedEntityFieldTypes) {
      expect(html).toContain(`value="${fieldType}"`);
    }

    expect(html.match(/<option /g)).toHaveLength(17);
    expect(html).not.toContain("JSON");
    expect(html).not.toContain("disabled=\"\"");
  });

  it("renders an edit selector as disabled but still visible when locked", () => {
    const html = renderFieldTypeSelect({ disabled: true, type: "RELATION" });

    expect(html).toContain("Tipo de campo");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Relación con otra entidad");
    expect(html).toContain("No puedes cambiar el tipo porque este campo ya contiene información.");
    expect(html).toContain("type=\"hidden\"");
    expect(html).toContain("value=\"RELATION\"");
  });

  it("does not render an empty trigger value for a valid initial type", () => {
    const html = renderFieldTypeSelect({ type: "SELECT" });

    expect(html).toContain("Lista de opciones");
    expect(html).toContain("Permite elegir una opción predefinida.");
  });
});
