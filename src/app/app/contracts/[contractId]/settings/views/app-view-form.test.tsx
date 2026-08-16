import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppViewForm } from "./app-view-form";

const entityTypes = [
  {
    fields: [
      { id: "field_1", isActive: true, key: "estado", name: "Estado" },
      { id: "field_2", isActive: false, key: "cerrado", name: "Cerrado" },
    ],
    icon: "users",
    id: "people",
    name: "Personas",
  },
  {
    fields: [],
    icon: "clipboard-check",
    id: "attendance",
    name: "Asistencias",
  },
];

describe("AppViewForm", () => {
  it("renders common fields and controlled AppView types", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={() => undefined}
        entityTypes={entityTypes}
        submitLabel="Crear experiencia"
      />,
    );

    expect(html).toContain("Nombre");
    expect(html).toContain("Slug");
    expect(html).toContain("Icono opcional");
    expect(html).toContain("Tipo");
    expect(html).toContain("Registros");
    expect(html).toContain("Flujo");
    expect(html).toContain("Tablero");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Configuración de registros");
    expect(html).toContain("Crear experiencia");
  });

  it("renders the selected workflow configuration", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={() => undefined}
        entityTypes={entityTypes}
        initialValues={{
          active: true,
          config: {
            sourceEntityTypeId: "people",
            targetEntityTypeId: "attendance",
            type: "WORKFLOW",
            workflow: "attendance",
          },
          icon: "clipboard-check",
          name: "Tomar asistencia",
          slug: "tomar-asistencia",
          sortOrder: 1,
          type: "WORKFLOW",
        }}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Configuración del flujo");
    expect(html).toContain("Entidad fuente");
    expect(html).toContain("Entidad destino");
    expect(html).toContain("Asistencia");
  });
});
