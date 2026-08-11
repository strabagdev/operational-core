import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FieldOptionsEditor } from "./field-options-editor";

describe("field options editor", () => {
  it("renders compact option controls and hidden payload for saved options", () => {
    const html = renderToStaticMarkup(
      <FieldOptionsEditor
        fieldErrors={{}}
        initialOptions={[
          {
            id: "opt_activo",
            label: "Activo",
            value: "activo",
            sortOrder: 1,
            isActive: false,
            hasValues: true,
          },
        ]}
      />,
    );

    expect(html).toContain("1 opciones");
    expect(html).toContain("0 activas");
    expect(html).toContain("1 inactivas");
    expect(html).toContain('name="fieldOptionsPayload"');
    expect(html).toContain("&quot;label&quot;:&quot;Activo&quot;");
    expect(html).toContain('name="optionId:opt_activo"');
    expect(html).toContain('name="optionActive:opt_activo"');
    expect(html).toContain('value="false"');
    expect(html).toContain("Mover Activo hacia arriba");
    expect(html).toContain("Mover Activo hacia abajo");
    expect(html).toContain("Activar");
    expect(html).toContain("Eliminar");
    expect(html).not.toContain("Quitar");
  });

  it("disables delete for used options with an explanatory title", () => {
    const html = renderToStaticMarkup(
      <FieldOptionsEditor
        fieldErrors={{}}
        initialOptions={[
          {
            id: "opt_activo",
            label: "Activo",
            value: "activo",
            sortOrder: 1,
            isActive: true,
            hasValues: true,
            usageCount: 12,
          },
        ]}
      />,
    );

    expect(html).toContain("Eliminar");
    expect(html).toContain("disabled");
    expect(html).toContain(
      "No puedes eliminar esta opción porque está siendo utilizada en 12 registros.",
    );
  });

  it("shows search only when there are more than ten options", () => {
    const fewOptions = renderToStaticMarkup(
      <FieldOptionsEditor
        fieldErrors={{}}
        initialOptions={Array.from({ length: 10 }, (_, index) => ({
          id: `opt_${index}`,
          label: `Opción ${index}`,
          value: `opcion_${index}`,
          sortOrder: index + 1,
          isActive: true,
        }))}
      />,
    );
    const manyOptions = renderToStaticMarkup(
      <FieldOptionsEditor
        fieldErrors={{}}
        initialOptions={Array.from({ length: 11 }, (_, index) => ({
          id: `opt_${index}`,
          label: `Opción ${index}`,
          value: `opcion_${index}`,
          sortOrder: index + 1,
          isActive: true,
        }))}
      />,
    );

    expect(fewOptions).not.toContain("Buscar opciones");
    expect(manyOptions).toContain("Buscar opciones");
  });

  it("renders the locked internal value message for used saved options in edit mode", () => {
    const html = renderToStaticMarkup(
      <FieldOptionsEditor
        fieldErrors={{}}
        initialOptions={[
          {
            id: "opt_activo",
            label: "Activo",
            value: "activo",
            sortOrder: 1,
            isActive: true,
            hasValues: true,
            editing: true,
          },
        ]}
      />,
    );

    expect(html).toContain(
      "No puedes modificar el valor interno porque esta opción ya está siendo utilizada.",
    );
  });
});
