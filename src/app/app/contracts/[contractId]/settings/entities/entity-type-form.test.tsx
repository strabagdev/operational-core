import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  EntityTypeForm,
  getEntityIconPickerFormValue,
  getEntityIconPickerLabel,
  getEntityIconPickerOptions,
} from "./entity-type-form";

describe("EntityTypeForm icon selector", () => {
  it("renders a compact closed selector without the permanent catalog", () => {
    const html = renderToStaticMarkup(
      <EntityTypeForm action={() => undefined} submitLabel="Crear tipo" />,
    );

    expect(html).toContain("Icono opcional");
    expect(html).toContain("Sin icono");
    expect(html).toContain("Seleccionar icono de entidad");
    expect(html).toContain('name="icon"');
    expect(html).toContain('value=""');
    expect(html).not.toContain("Transporte");
    expect(html).not.toContain("Configuración");
  });

  it("renders the selected icon in the closed state", () => {
    const html = renderToStaticMarkup(
      <EntityTypeForm
        action={() => undefined}
        initialValues={{
          description: null,
          icon: "warehouse",
          isActive: true,
          name: "Bodega",
          nature: "REFERENCE",
          slug: "bodega",
        }}
        submitLabel="Guardar tipo"
      />,
    );

    expect(html).toContain("Bodega");
    expect(html).toContain('value="warehouse"');
    expect(html).not.toContain('value=""');
  });

  it("opens with no-icon first and catalog options available through picker options", () => {
    const options = getEntityIconPickerOptions("");

    expect(options[0]).toEqual({ icon: null, key: "none", label: "Sin icono" });
    expect(options).toEqual(expect.arrayContaining([
      { icon: "warehouse", key: "warehouse", label: "Bodega" },
      { icon: "pickaxe", key: "pickaxe", label: "Faena" },
    ]));
  });

  it("filters options by label", () => {
    expect(getEntityIconPickerOptions("fae")).toEqual([
      { icon: null, key: "none", label: "Sin icono" },
      { icon: "pickaxe", key: "pickaxe", label: "Faena" },
    ]);
  });

  it("maps selections to the submitted form value", () => {
    expect(getEntityIconPickerFormValue("warehouse")).toBe("warehouse");
    expect(getEntityIconPickerFormValue(null)).toBe("");
    expect(getEntityIconPickerLabel("warehouse")).toBe("Bodega");
    expect(getEntityIconPickerLabel(null)).toBe("Sin icono");
  });
});

describe("EntityTypeForm nature selector", () => {
  it("renders the nature selector with MASTER selected by default", () => {
    const html = renderToStaticMarkup(
      <EntityTypeForm action={() => undefined} submitLabel="Crear tipo" />,
    );

    expect(html).toContain("Naturaleza");
    expect(html).toContain('name="nature"');
    expect(html).toContain('<option value="MASTER" selected="">Maestra</option>');
    expect(html).toContain("Catálogo estable reutilizado por otros registros.");
  });

  it("renders the selected initial nature and description", () => {
    const html = renderToStaticMarkup(
      <EntityTypeForm
        action={() => undefined}
        initialValues={{
          description: null,
          icon: null,
          isActive: true,
          name: "Movimientos",
          nature: "TRANSACTION",
          slug: "movimientos",
        }}
        submitLabel="Guardar tipo"
      />,
    );

    expect(html).toContain('<option value="TRANSACTION" selected="">Transaccional</option>');
    expect(html).toContain("Evento u operación que ocurre en el tiempo.");
  });
});
