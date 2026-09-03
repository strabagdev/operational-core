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
      { id: "revision_field", isActive: true, key: "revision", name: "Revisión", options: [], type: "TEXT" },
      { id: "counter_field", isActive: true, key: "contador", name: "Contador", options: [], type: "INTEGER" },
      { id: "reviewed_on_field", isActive: true, key: "revisado_el", name: "Revisado el", options: [], type: "DATE" },
      { id: "approved_field", isActive: true, key: "aprobado", name: "Aprobado", options: [], type: "BOOLEAN" },
      {
        id: "tags_field",
        isActive: true,
        key: "tags",
        multiple: true,
        name: "Etiquetas",
        options: [
          { id: "tag_option", isActive: true, label: "Tag", value: "tag" },
        ],
        type: "MULTISELECT",
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
    expect(html).toContain("Reporte");
    expect(html).toContain("Tablero");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Configuración de registros");
    expect(html).toContain("Crear experiencia");
  });

  it("renders REPORT table configuration", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={entityTypes}
        initialValues={{
          active: true,
          config: {
            dateFieldId: "date_field",
            entityTypeId: "attendance",
            presentationMode: "TABLE",
            timeFilter: {
              allowChange: true,
              defaultPeriod: "CURRENT_MONTH",
              mode: "RANGE",
            },
            table: {
              defaultSortDirection: "desc",
              defaultSortFieldId: "date_field",
              visibleFieldIds: ["person_field", "date_field", "status_field"],
            },
            type: "REPORT",
            valueDisplay: {
              status_field: "INTERNAL_VALUE",
            },
          },
          icon: "clipboard-check",
          name: "Asistencia mensual",
          slug: "asistencia-mensual",
          sortOrder: 2,
          type: "REPORT",
        }}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Configuración del reporte");
    expect(html).toContain("Filtro temporal");
    expect(html).toContain("Campo de fecha");
    expect(html).toContain("Presentación");
    expect(html).toContain("Rango");
    expect(html).toContain("Mes actual");
    expect(html).toContain("Permitir cambiar período");
    expect(html).toContain("Tabla");
    expect(html).toContain("Columnas visibles");
    expect(html).toContain('name="visibleFieldIds"');
    expect(html).toContain("Presentación de valores SELECT");
    expect(html).toContain("Estado · Mostrar valores como");
    expect(html).toContain("Etiqueta visible");
    expect(html).toContain("Valor interno");
    expect(html).toContain('name="reportValueDisplay:status_field"');
    expect(html).toContain('value="INTERNAL_VALUE" selected=""');
    expect(html).toContain("Dirección");
    expect(html).toContain("Descendente");
  });

  it("renders REPORT matrix configuration", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={entityTypes}
        initialValues={{
          active: true,
          config: {
            dateFieldId: "date_field",
            entityTypeId: "attendance",
            matrix: {
              columnFieldId: "date_field",
              rowFieldId: "person_field",
              summaryFieldId: "status_field",
              valueFieldId: "status_field",
            },
            presentationMode: "MATRIX",
            timeFilter: {
              allowChange: false,
              defaultPeriod: "CURRENT_MONTH",
              mode: "MONTH",
            },
            type: "REPORT",
            valueDisplay: {
              status_field: "INTERNAL_VALUE",
            },
          },
          icon: "clipboard-check",
          name: "Matriz asistencia",
          slug: "matriz-asistencia",
          sortOrder: 3,
          type: "REPORT",
        }}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Matriz");
    expect(html).toContain('value="MONTH" selected=""');
    expect(html).toContain("Filas");
    expect(html).toContain("Columnas");
    expect(html).toContain("Valor");
    expect(html).toContain("Resumen lateral");
    expect(html).toContain('name="reportRowFieldId"');
    expect(html).toContain('name="reportSummaryFieldId"');
    expect(html).toContain("Presentación de valores SELECT");
    expect(html).toContain('name="reportValueDisplay:status_field"');
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

  it("renders compatible STATE_UPDATE state fields without duplicating extras", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={entityTypes}
        initialValues={{
          active: true,
          config: {
            sourceEntityTypeId: "people",
            targetEntityTypeId: "attendance",
            subjectFieldId: "person_field",
            stateFields: [
              { fieldId: "status_field", required: true, defaultOptionId: "present_option" },
              { fieldId: "revision_field", required: true },
            ],
            extraFieldIds: ["revision_field", "observation_field"],
            dateFieldId: "date_field",
            uniqueness: { mode: "subject-date" },
            historyMode: "update-current",
            type: "WORKFLOW",
            workflowKey: "state-update",
          },
          icon: "clipboard-check",
          name: "Versionado",
          slug: "versionado",
          sortOrder: 1,
          type: "WORKFLOW",
        }}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Campos de estado");
    expect(html).toContain("Estado");
    expect(html).toContain("Revisión");
    expect(html).toContain("Contador");
    expect(html).toContain("Revisado el");
    expect(html).toContain("Aprobado");
    expect(html).not.toMatch(/name="stateFieldIds"[^>]+value="tags_field"/);
    expect(html).toContain("Opción por defecto · Estado");
    expect(html).not.toContain("Opción por defecto · Revisión");
    expect(html).toContain('name="stateFieldIds"');
    expect(html).not.toMatch(/name="extraFieldIds"[^>]+value="revision_field"/);
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
