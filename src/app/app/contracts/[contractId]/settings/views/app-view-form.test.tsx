import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppViewForm } from "./app-view-form";

const entityTypes = [
  {
    fields: [
      { id: "field_1", isActive: true, key: "estado", name: "Estado", type: "SELECT" },
      { id: "field_2", isActive: false, key: "cerrado", name: "Cerrado", type: "BOOLEAN" },
    ],
    icon: "users",
    id: "people",
    name: "Personas",
  },
  {
    fields: [
      { id: "person_field", isActive: true, key: "persona", name: "Persona", type: "RELATION" },
      { id: "date_field", isActive: true, key: "fecha", name: "Fecha", type: "DATE" },
      { id: "status_field", isActive: true, key: "estado", name: "Estado", type: "SELECT" },
      { id: "observation_field", isActive: true, key: "observacion", name: "Observación", type: "TEXTAREA" },
    ],
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
            personFieldId: "person_field",
            dateFieldId: "date_field",
            statusFieldId: "status_field",
            observationFieldId: "observation_field",
            type: "WORKFLOW",
            workflowKey: "attendance",
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
    expect(html).toContain("Campo Persona");
    expect(html).toContain("Campo Fecha");
    expect(html).toContain("Campo Estado");
    expect(html).toContain("Campo Observación");
  });
});
