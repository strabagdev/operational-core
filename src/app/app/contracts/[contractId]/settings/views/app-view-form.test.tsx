import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppViewForm } from "./app-view-form";
import type { AppViewActionState } from "./actions";

const entityTypes = [
  {
    fields: [
      { id: "field_1", isActive: true, key: "estado", name: "Estado", options: [], type: "SELECT" },
      { id: "field_2", isActive: false, key: "cerrado", name: "Cerrado", options: [], type: "BOOLEAN" },
    ],
    icon: "users",
    id: "people",
    name: "Personas",
  },
  {
    fields: [
      { id: "person_field", isActive: true, key: "persona", name: "Persona", options: [], type: "RELATION" },
      { id: "date_field", isActive: true, key: "fecha", name: "Fecha", options: [], type: "DATE" },
      {
        id: "status_field",
        isActive: true,
        key: "estado",
        name: "Estado",
        options: [
          { id: "present_option", isActive: true, label: "PRESENTE", value: "presente" },
          { id: "absent_option", isActive: true, label: "AUSENTE", value: "ausente" },
          { id: "late_option", isActive: true, label: "ATRASO", value: "atraso" },
        ],
        type: "SELECT",
      },
      {
        id: "shift_field",
        isActive: true,
        key: "turno",
        multiple: false,
        name: "Turno",
        options: [
          { id: "day_option", isActive: true, label: "Día", value: "dia" },
        ],
        type: "SELECT",
      },
      {
        id: "sector_field",
        isActive: true,
        key: "sector",
        multiple: false,
        name: "Sector",
        options: [
          { id: "north_option", isActive: true, label: "Norte", value: "norte" },
        ],
        type: "SELECT",
      },
      { id: "observation_field", isActive: true, key: "observacion", name: "Observación", options: [], type: "TEXTAREA" },
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
        action={noopAction}
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
        action={noopAction}
        entityTypes={entityTypes}
        initialValues={{
          active: true,
          config: {
            sourceEntityTypeId: "people",
            targetEntityTypeId: "attendance",
            personFieldId: "person_field",
            dateFieldId: "date_field",
            statusFieldId: "status_field",
            defaultCheckInOptionId: "present_option",
            contextFieldIds: ["sector_field", "shift_field"],
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
    expect(html).toContain("Estado por defecto de checking");
    expect(html).toContain("Campo Observación");
    expect(html).toContain("Campos de contexto");
    expect(html).toContain("Turno");
    expect(html).toContain("Sector");
    expect(html).toContain('name="contextFieldIds"');
  });

  it("renders returned validation errors and preserved workflow values", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={entityTypes}
        initialActionState={{
          success: false,
          message: "Selecciona el estado por defecto de checking.",
          fieldErrors: {
            defaultCheckInOptionId: ["Selecciona el estado por defecto de checking."],
          },
          values: {
            name: "Registro de Asistencia",
            slug: "registro-de-asistencia",
            type: "WORKFLOW",
            sourceEntityTypeId: "people",
            targetEntityTypeId: "attendance",
            personFieldId: "person_field",
            dateFieldId: "date_field",
            statusFieldId: "status_field",
            defaultCheckInOptionId: "present_option",
            observationFieldId: "observation_field",
          },
        }}
        submitLabel="Crear experiencia"
      />,
    );

    expect(html).toContain("Selecciona el estado por defecto de checking.");
    expect(html).toContain('value="Registro de Asistencia"');
    expect(html).toContain('value="registro-de-asistencia"');
    expect(html).toContain('value="status_field" selected=""');
    expect(html).toContain('value="present_option" selected=""');
  });
});

async function noopAction(state: AppViewActionState) {
  return state;
}
