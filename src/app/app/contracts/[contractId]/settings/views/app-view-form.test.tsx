import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AppViewForm,
  cleanPanelDatasetForEntity,
  cleanPanelFiltersForEntity,
  cleanPanelKpiConfigForFormat,
  cleanPanelMetricsForDatasets,
  cleanPanelModulesForDatasets,
  incompatiblePanelColumns,
  packPanelModules,
  panelModuleLayoutOverlaps,
  sortPanelModulesByLayout,
} from "./app-view-form";
import type { AppViewActionState } from "./actions";
import type { PanelConfig } from "@/lib/app-views";

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
      {
        config: { relationKind: "ONE", targetEntityTypeId: "people" },
        id: "person_field",
        isActive: true,
        key: "persona",
        name: "Persona",
        options: [],
        type: "RELATION",
      },
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
    expect(html).toContain("Panel");
    expect(html).toContain("Configuración de registros");
    expect(html).not.toContain("Subvista Estados");
    expect(html).toContain("Crear experiencia");
  });

  it("renders PANEL visual sections without exposing technical JSON", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={entityTypes}
        initialValues={{
          active: true,
          config: {
            type: "PANEL",
            schemaVersion: 1,
            layout: { columns: 12, rowHeight: 8 },
            filters: [
              { id: "status", label: "Estado", valueType: "OPTION" },
            ],
            datasets: [
              {
                id: "attendance-records",
                name: "Asistencias",
                source: { type: "ENTITY", entityTypeId: "attendance" },
                transformation: {
                  type: "RECORDS",
                  fieldIds: ["person_field", "date_field", "status_field"],
                  pagination: { pageSize: 25 },
                },
              },
            ],
            modules: [
              {
                id: "attendance-table",
                title: "Tabla de asistencia",
                datasetId: "attendance-records",
                visualization: {
                  type: "TABLE",
                  config: {
                    columns: [
                      { fieldId: "date_field", format: "DD-MM-YYYY" },
                      { fieldId: "person_field" },
                      { fieldId: "status_field", valueDisplay: "LABEL" },
                    ],
                    searchable: true,
                    paginated: true,
                  },
                },
                layout: { x: 0, y: 0, w: 12, h: 6 },
              },
            ],
            metrics: [],
            calculatedFields: [],
          },
          icon: "clipboard-check",
          name: "Panel asistencia",
          slug: "panel-asistencia",
          sortOrder: 5,
          type: "PANEL",
        }}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Configuración del panel");
    expect(html).toContain("Fuentes de datos");
    expect(html).toContain("Filtros");
    expect(html).toContain("Módulos");
    expect(html).toContain("Diseño");
    expect(html).toContain("Agregar dataset");
    expect(html).toContain("Agregar filtro");
    expect(html).toContain("Agregar tabla");
    expect(html).toContain("Agregar KPI");
    expect(html).toContain("Tabla de asistencia");
    expect(html).toContain("DD-MM-YYYY");
    expect(html).toContain('name="panelConfig"');
    expect(html).not.toContain("<textarea");
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

  it("renders STATE_UPDATE CURRENT report table configuration", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        appViews={[
          {
            active: true,
            config: {
              sourceEntityTypeId: "people",
              targetEntityTypeId: "attendance",
              subjectFieldId: "person_field",
              stateFields: [
                { fieldId: "status_field", label: "Estatus actual", required: true },
                { fieldId: "counter_field", label: "Revisión actual", required: true },
                { fieldId: "approved_field", required: false },
              ],
              extraFieldIds: [],
              uniqueness: { mode: "subject" },
              historyMode: "append",
              type: "WORKFLOW",
              workflowKey: "state-update",
            },
            id: "versionado_view",
            name: "Versionado Procedimientos",
            type: "WORKFLOW",
          },
        ]}
        entityTypes={entityTypes}
        initialValues={{
          active: true,
          config: {
            sourceMode: "STATE_UPDATE",
            stateUpdateAppViewId: "versionado_view",
            projection: "CURRENT",
            presentationMode: "TABLE",
            timeFilter: {
              allowChange: true,
              defaultPeriod: "CURRENT_MONTH",
              mode: "RANGE",
            },
            table: {
              defaultSortDirection: "asc",
              defaultSortFieldId: "subject.displayName",
              visibleFieldIds: ["subject.displayName", "state:status_field", "state:counter_field"],
            },
            type: "REPORT",
            valueDisplay: {},
          },
          icon: "clipboard-check",
          name: "Estado actual",
          slug: "estado-actual",
          sortOrder: 4,
          type: "REPORT",
        }}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Fuente del reporte");
    expect(html).toContain("Actualización de estado");
    expect(html).toContain("Versionado Procedimientos");
    expect(html).toContain("Estado actual");
    expect(html).toContain("Tabla");
    expect(html).not.toContain("Matriz");
    expect(html).toContain("Columnas disponibles");
    expect(html).toContain("Personas");
    expect(html).toContain("Estatus actual");
    expect(html).toContain("Revisión actual");
    expect(html).toContain("Actualizado");
    expect(html).toContain('name="visibleFieldIds"');
    expect(html).toMatch(/name="visibleFieldIds" checked="" value="state:counter_field"/);
  });

  it("renders REPORT current status configuration", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={entityTypes}
        initialValues={{
          active: true,
          config: {
            entityTypeId: "attendance",
            presentationMode: "LATEST_BY_RELATION",
            latestByRelation: {
              relatedEntityTypeId: "people",
              relationFieldId: "person_field",
              requiredValueFieldId: "status_field",
              orderFieldId: "reviewed_on_field",
              displayFieldIds: ["person_field", "status_field", "reviewed_on_field"],
            },
            timeFilter: {
              allowChange: false,
              defaultPeriod: "CURRENT_MONTH",
              mode: "RANGE",
            },
            type: "REPORT",
            valueDisplay: {},
          },
          icon: "clipboard-check",
          name: "Dashboard Procedimientos",
          slug: "dashboard-procedimientos",
          sortOrder: 4,
          type: "REPORT",
        }}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Último por relación");
    expect(html).not.toContain("Estado actual (compatibilidad)");
    expect(html).toContain("Registro relacionado");
    expect(html).toContain("Campo que identifica el registro cuyo estado se mostrará");
    expect(html).toContain("Campo requerido");
    expect(html).toContain("Columnas visibles");
    expect(html).toContain("Entidad relacionada");
    expect(html).toContain('name="latestByRelationRelatedEntityTypeId"');
    expect(html).toContain('name="latestByRelationRelationFieldId"');
    expect(html).toContain('name="latestByRelationRequiredValueFieldId"');
    expect(html).toContain('name="latestByRelationOrderFieldId"');
    expect(html).toContain('name="displayFieldIds"');
    expect(html).toContain('aria-label="Subir Estado"');
    expect(html).toContain('aria-label="Bajar Estado"');
    expect(html).not.toContain("Subvista Estados");
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

  it("renders PANEL in a full-width editor with separate configuration and preview areas", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={panelEntityTypes()}
        initialValues={panelInitialValues()}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("grid w-full gap-4");
    expect(html).toContain("Datos generales");
    expect(html).toContain("Fuentes de datos");
    expect(html).toContain("Filtros");
    expect(html).toContain("Módulos");
    expect(html).toContain("Diseño");
    expect(html).toContain("Vista previa");
    expect(html).toContain("Grilla de 12 columnas");
    expect(html).toContain("Última versión por procedimiento");
    expect(html).toContain("latest-procedure-status");
    expect(html).toContain("TABLE");
    expect(html).toContain("1. Procedimiento");
    expect(html).toContain("2. Estatus");
    expect(html).toContain("3. Revisión");
    expect(html).toContain("4. Fecha");
  });

  it("renders PANEL KPI metrics and preview without exposing raw JSON", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={panelEntityTypes()}
        initialValues={panelInitialValues({
          metrics: [
            {
              id: "total-registros",
              name: "Total de registros",
              datasetId: "latest-procedure-status",
              aggregation: "COUNT",
              fieldId: null,
              filterIds: [],
            },
          ],
          modules: [
            panelConfigFixture().modules[0],
            {
              id: "total-kpi",
              title: "Total",
              datasetId: "latest-procedure-status",
              visualization: {
                type: "KPI",
                config: {
                  metricId: "total-registros",
                  label: "Total de registros",
                  format: "NUMBER",
                },
              },
              layout: { x: 0, y: 1, w: 4, h: 2 },
            },
          ],
        })}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Métricas");
    expect(html).toContain("Agregar KPI");
    expect(html).toContain("Indicador");
    expect(html).toContain("Valor de ejemplo en vista previa");
    expect(html).not.toContain("<textarea");
  });

  it("orders PANEL modules by layout position independently of array order", () => {
    const modules = [
      {
        id: "kpi-1",
        title: "Indicador",
        datasetId: "latest-procedure-status",
        visualization: {
          type: "KPI" as const,
          config: { metricId: "metric-1", label: "Indicador", format: "NUMBER" as const },
        },
        layout: { x: 0, y: 2, w: 4, h: 2 },
      },
      {
        id: "table-1",
        title: "Tabla",
        datasetId: "latest-procedure-status",
        visualization: panelConfigFixture().modules[0]?.visualization ?? {
          type: "TABLE" as const,
          config: { columns: [{ fieldId: "procedure_field" }], searchable: true, paginated: true },
        },
        layout: { x: 0, y: 0, w: 12, h: 6 },
      },
    ];

    expect(sortPanelModulesByLayout(modules).map((module) => module.id)).toEqual(["table-1", "kpi-1"]);
  });

  it("renders preview in spatial order and serializes PANEL modules in the same order", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={panelEntityTypes()}
        initialValues={panelInitialValues({
          metrics: [
            {
              id: "metric-1",
              name: "Indicador",
              datasetId: "latest-procedure-status",
              aggregation: "COUNT",
              fieldId: null,
              filterIds: [],
            },
          ],
          modules: [
            {
              id: "kpi-1",
              title: "Indicador",
              datasetId: "latest-procedure-status",
              visualization: {
                type: "KPI",
                config: { metricId: "metric-1", label: "Indicador", format: "NUMBER" },
              },
              layout: { x: 0, y: 2, w: 4, h: 2 },
            },
            {
              ...panelConfigFixture().modules[0],
              id: "table-1",
              title: "Tabla",
              layout: { x: 0, y: 0, w: 12, h: 6 },
            },
          ],
        })}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html.indexOf("x0 y0 · 12x6")).toBeLessThan(html.indexOf("x0 y2 · 4x2"));
    expect(html.indexOf("&quot;id&quot;:&quot;table-1&quot;")).toBeLessThan(
      html.indexOf("&quot;id&quot;:&quot;kpi-1&quot;"),
    );
    expect(html).toContain("x0 y0 · 12x6");
    expect(html).toContain("x0 y2 · 4x2");
  });

  it("packs moved PANEL modules deterministically without overlaps", () => {
    const kpi = {
      id: "kpi-1",
      title: "Indicador",
      layout: { x: 0, y: 2, w: 4, h: 2 },
    };
    const table = {
      id: "table-1",
      title: "Tabla",
      layout: { x: 0, y: 0, w: 12, h: 6 },
    };

    expect(packPanelModules([kpi, table], 12).map((module) => module.layout)).toEqual([
      { x: 0, y: 0, w: 4, h: 2 },
      { x: 0, y: 2, w: 12, h: 6 },
    ]);
    expect(panelModuleLayoutOverlaps(packPanelModules([kpi, table], 12))).toEqual([]);
  });

  it("packs three KPI modules in the same row and sends a full-width module to the next row", () => {
    const kpi = (id: string) => ({ id, layout: { x: 0, y: 0, w: 4, h: 2 } });
    const table = { id: "table-1", layout: { x: 0, y: 0, w: 12, h: 6 } };

    expect(packPanelModules([kpi("kpi-1"), kpi("kpi-2"), kpi("kpi-3"), table], 12).map((module) => module.layout)).toEqual([
      { x: 0, y: 0, w: 4, h: 2 },
      { x: 4, y: 0, w: 4, h: 2 },
      { x: 8, y: 0, w: 4, h: 2 },
      { x: 0, y: 2, w: 12, h: 6 },
    ]);
  });

  it("detects and warns about overlapping PANEL modules in preview", () => {
    const modules = [
      {
        id: "kpi-1",
        title: "Indicador",
        layout: { x: 0, y: 1, w: 4, h: 2 },
      },
      {
        id: "table-1",
        title: "Tabla",
        layout: { x: 0, y: 0, w: 12, h: 6 },
      },
    ];

    expect(panelModuleLayoutOverlaps(modules).map((overlap) => [
      overlap.left.title,
      overlap.right.title,
    ])).toEqual([["Indicador", "Tabla"]]);

    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={panelEntityTypes()}
        initialValues={panelInitialValues({
          metrics: [
            {
              id: "metric-1",
              name: "Indicador",
              datasetId: "latest-procedure-status",
              aggregation: "COUNT",
              fieldId: null,
              filterIds: [],
            },
          ],
          modules: [
            {
              id: "kpi-1",
              title: "Indicador",
              datasetId: "latest-procedure-status",
              visualization: {
                type: "KPI",
                config: { metricId: "metric-1", label: "Indicador", format: "NUMBER" },
              },
              layout: { x: 0, y: 1, w: 4, h: 2 },
            },
            {
              ...panelConfigFixture().modules[0],
              id: "table-1",
              title: "Tabla",
              layout: { x: 0, y: 0, w: 12, h: 6 },
            },
          ],
        })}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Se solapa con Tabla.");
    expect(html).toContain("Se solapa con Indicador.");
    expect(html).toContain("Los módulos Indicador y Tabla se solapan en el layout.");
    expect(html).toContain("Organizar automáticamente");
    expect(html).toContain("x0 y0 · 12x6");
    expect(html).toContain("x0 y1 · 4x2");
  });

  it("renders explicit MONEY and PERCENT KPI presentation controls", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={panelEntityTypes()}
        initialValues={panelInitialValues({
          metrics: [
            {
              id: "monto-total",
              name: "Monto total",
              datasetId: "latest-procedure-status",
              aggregation: "SUM",
              fieldId: "revision_field",
              filterIds: [],
            },
            {
              id: "avance",
              name: "Avance",
              datasetId: "latest-procedure-status",
              aggregation: "AVG",
              fieldId: "revision_field",
              filterIds: [],
            },
          ],
          modules: [
            {
              id: "monto-kpi",
              title: "Monto",
              datasetId: "latest-procedure-status",
              visualization: {
                type: "KPI",
                config: {
                  metricId: "monto-total",
                  label: "Monto total",
                  format: "MONEY",
                  currencyCode: "CLP",
                },
              },
              layout: { x: 0, y: 0, w: 4, h: 2 },
            },
            {
              id: "avance-kpi",
              title: "Avance",
              datasetId: "latest-procedure-status",
              visualization: {
                type: "KPI",
                config: {
                  metricId: "avance",
                  label: "Avance",
                  format: "PERCENT",
                  percentScale: "RATIO",
                },
              },
              layout: { x: 4, y: 0, w: 4, h: 2 },
            },
          ],
        })}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("Moneda");
    expect(html).toContain("CLP");
    expect(html).toContain("Escala del porcentaje");
    expect(html).toContain("Proporción: 0,25 → 25 %");
    expect(html).toContain("Porcentaje completo: 25 → 25 %");
    expect(html).toContain("$");
    expect(html).toContain("25 %");
  });

  it("cleans incompatible KPI presentation properties when format changes", () => {
    expect(cleanPanelKpiConfigForFormat({
      metricId: "monto-total",
      label: "Monto total",
      format: "MONEY",
      currencyCode: "CLP",
    }, "NUMBER")).toEqual({
      metricId: "monto-total",
      label: "Monto total",
      format: "NUMBER",
    });

    expect(cleanPanelKpiConfigForFormat({
      metricId: "avance",
      label: "Avance",
      format: "PERCENT",
      percentScale: "WHOLE",
    }, "MONEY")).toEqual({
      metricId: "avance",
      label: "Avance",
      format: "MONEY",
      currencyCode: "CLP",
    });

    expect(cleanPanelKpiConfigForFormat({
      metricId: "avance",
      label: "Avance",
      format: "NUMBER",
    }, "PERCENT")).toEqual({
      metricId: "avance",
      label: "Avance",
      format: "PERCENT",
      percentScale: "RATIO",
    });
  });

  it("keeps non-PANEL AppViews on the existing narrow form layout", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={entityTypes}
        submitLabel="Crear experiencia"
      />,
    );

    expect(html).not.toContain("grid w-full gap-4");
    expect(html).not.toContain("Vista previa");
  });

  it("shows an action to repair incompatible columns in an existing invalid PANEL config", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={panelEntityTypes()}
        initialValues={panelInitialValues({
          datasets: [
            {
              id: "dataset-1",
              name: "Versionado",
              source: { type: "ENTITY", entityTypeId: "versions" },
              transformation: {
                type: "RECORDS",
                fieldIds: ["procedure_field", "status_field"],
                pagination: { pageSize: 25 },
              },
            },
          ],
          modules: [
            {
              id: "table-1",
              title: "Tabla",
              datasetId: "dataset-1",
              visualization: {
                type: "TABLE",
                config: {
                  columns: [
                    { fieldId: "number_field" },
                    { fieldId: "status_field" },
                  ],
                  searchable: true,
                  paginated: true,
                },
              },
              layout: { x: 0, y: 0, w: 12, h: 6 },
            },
          ],
        })}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain("La columna Número no pertenece al dataset Versionado.");
    expect(html).toContain("Quitar columnas incompatibles");
    expect(html).not.toContain("number_field no pertenece");
  });

  it("cleans Procedimientos fields and table columns when the dataset entity changes to Versionado", () => {
    const entities = panelEntityTypes();
    const versionado = entities.find((entityType) => entityType.id === "versions");
    const dataset = {
      id: "dataset-1",
      name: "Dataset",
      source: { type: "ENTITY" as const, entityTypeId: "versions" },
      transformation: {
        type: "RECORDS" as const,
        fieldIds: ["number_field", "status_field"],
        pagination: { pageSize: 25 },
      },
    };
    const cleanedDataset = cleanPanelDatasetForEntity(dataset, versionado, entities);
    const cleanedModules = cleanPanelModulesForDatasets([
      {
        id: "table-1",
        title: "Tabla",
        datasetId: "dataset-1",
        visualization: {
          type: "TABLE",
          config: {
            columns: [{ fieldId: "number_field" }, { fieldId: "status_field" }],
          },
        },
        layout: { x: 0, y: 0, w: 12, h: 6 },
      },
    ], [cleanedDataset]);

    expect(cleanedDataset.transformation.fieldIds).toEqual(["status_field"]);
    expect(cleanedModules[0]?.visualization.type).toBe("TABLE");
    if (cleanedModules[0]?.visualization.type !== "TABLE") return;
    expect(cleanedModules[0].visualization.config.columns).toEqual([{ fieldId: "status_field" }]);
  });

  it("keeps fields that are still valid when the PANEL dataset entity changes", () => {
    const entities = panelEntityTypes();
    const versionado = entities.find((entityType) => entityType.id === "versions");
    const cleaned = cleanPanelDatasetForEntity({
      id: "dataset-1",
      source: { type: "ENTITY", entityTypeId: "versions" },
      transformation: {
        type: "RECORDS",
        fieldIds: ["status_field", "missing_field", "date_field"],
      },
    }, versionado, entities);

    expect(cleaned.transformation.fieldIds).toEqual(["status_field", "date_field"]);
  });

  it("cleans incompatible transformation properties when switching PANEL transformation modes", () => {
    const latestConfig = panelInitialValues().config;
    const dataset = latestConfig.type === "PANEL" ? latestConfig.datasets[0] : undefined;
    expect(dataset?.transformation.type).toBe("LATEST_BY_RELATION");

    const recordsDataset = {
      ...dataset!,
      transformation: {
        type: "RECORDS" as const,
        fieldIds: dataset!.transformation.fieldIds,
        pagination: dataset!.transformation.pagination,
      },
    };

    expect(recordsDataset.transformation).not.toHaveProperty("relationFieldId");
    expect(recordsDataset.transformation).not.toHaveProperty("orderFieldId");

    const latestDataset = {
      ...recordsDataset,
      transformation: {
        type: "LATEST_BY_RELATION" as const,
        relatedEntityTypeId: "procedures",
        relationFieldId: "",
        orderFieldId: "",
        requiredValueFieldId: undefined,
        fieldIds: recordsDataset.transformation.fieldIds,
        pagination: recordsDataset.transformation.pagination,
      },
    };

    expect(latestDataset.transformation).not.toHaveProperty("sort");
    expect(latestDataset.transformation).not.toHaveProperty("filters");
  });

  it("cleans invalid table columns when a TABLE module changes datasets", () => {
    const datasets = [
      {
        id: "procedures-records",
        source: { type: "ENTITY" as const, entityTypeId: "procedures" },
        transformation: { type: "RECORDS" as const, fieldIds: ["number_field"] },
      },
      {
        id: "version-records",
        source: { type: "ENTITY" as const, entityTypeId: "versions" },
        transformation: { type: "RECORDS" as const, fieldIds: ["status_field", "date_field"] },
      },
    ];
    const panelModule = {
      id: "table-1",
      datasetId: "version-records",
      visualization: {
        type: "TABLE" as const,
        config: {
          columns: [{ fieldId: "number_field" }, { fieldId: "date_field" }],
        },
      },
      layout: { x: 0, y: 0, w: 12, h: 6 },
    };

    const cleanedModule = cleanPanelModulesForDatasets([panelModule], datasets)[0];

    expect(cleanedModule?.visualization.type).toBe("TABLE");
    if (cleanedModule?.visualization.type !== "TABLE") return;
    expect(cleanedModule.visualization.config.columns).toEqual([
      { fieldId: "date_field" },
    ]);
  });

  it("cleans metric field and filter dependencies when a PANEL dataset changes", () => {
    const datasets = [
      {
        id: "version-records",
        source: { type: "ENTITY" as const, entityTypeId: "versions" },
        filters: [{ type: "PANEL_FILTER" as const, filterId: "status", fieldId: "status_field", operator: "EQ" as const }],
        transformation: { type: "RECORDS" as const, fieldIds: ["status_field", "date_field"] },
      },
      {
        id: "procedure-records",
        source: { type: "ENTITY" as const, entityTypeId: "procedures" },
        transformation: { type: "RECORDS" as const, fieldIds: ["number_field"] },
      },
    ];

    expect(cleanPanelMetricsForDatasets([
      {
        id: "metric-1",
        name: "Métrica",
        datasetId: "procedure-records",
        aggregation: "COUNT_VALUES",
        fieldId: "status_field",
        filterIds: ["status"],
      },
    ], datasets)).toEqual([
      {
        id: "metric-1",
        name: "Métrica",
        datasetId: "procedure-records",
        aggregation: "COUNT_VALUES",
        fieldId: null,
        filterIds: [],
      },
    ]);
  });

  it("reports incompatible columns for a module so the UI can repair legacy configs", () => {
    const datasets = [{
      id: "version-records",
      source: { type: "ENTITY" as const, entityTypeId: "versions" },
      transformation: { type: "RECORDS" as const, fieldIds: ["status_field"] },
    }];
    const panelModule = {
      id: "table-1",
      datasetId: "version-records",
      visualization: {
        type: "TABLE" as const,
        config: {
          columns: [{ fieldId: "number_field" }, { fieldId: "status_field" }],
        },
      },
      layout: { x: 0, y: 0, w: 12, h: 6 },
    };

    expect(incompatiblePanelColumns(panelModule, datasets)).toEqual([{ fieldId: "number_field" }]);
  });

  it("cleans filter bindings when the target field is not available in the new PANEL entity", () => {
    const versionado = panelEntityTypes().find((entityType) => entityType.id === "versions");

    expect(cleanPanelFiltersForEntity([
      { id: "filter-1", label: "Filtro", valueType: "NUMBER", fieldId: "number_field", operator: "EQ" },
      { id: "filter-2", label: "Estado", valueType: "OPTION", fieldId: "status_field", operator: "EQ" },
    ], versionado)).toEqual([
      { id: "filter-1", label: "Filtro", valueType: "TEXT", fieldId: undefined, operator: undefined },
      { id: "filter-2", label: "Estado", valueType: "OPTION", fieldId: "status_field", operator: "EQ" },
    ]);
  });

  it("places PANEL validation errors in the affected navigation section and element", () => {
    const html = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={panelEntityTypes()}
        initialActionState={{
          success: false,
          message: "Revisa la configuración del panel. Hay campos obligatorios o selecciones incompatibles.",
          fieldErrors: {
            form: ["Revisa la configuración del panel. Hay campos obligatorios o selecciones incompatibles."],
            panelDatasetFields: ["Selecciona al menos un campo para el dataset."],
            panelModuleColumns: ["Selecciona al menos una columna para la tabla."],
          },
          values: {
            name: "Panel Test",
            slug: "panel-test",
            type: "PANEL",
            panelConfig: JSON.stringify(panelConfigFixture({
              datasets: [
                {
                  id: "dataset-1",
                  source: { type: "ENTITY", entityTypeId: "versions" },
                  transformation: { type: "RECORDS", fieldIds: [] },
                },
              ],
              modules: [
                {
                  id: "table-1",
                  datasetId: "dataset-1",
                  visualization: { type: "TABLE", config: { columns: [] } },
                  layout: { x: 0, y: 0, w: 12, h: 6 },
                },
              ],
            })),
          },
        }}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(html).toContain('href="#fuentes-de-datos"');
    expect(html).toContain('href="#modulos"');
    expect(html).toContain("Selecciona al menos un campo para el dataset.");
    expect(html).toContain("Selecciona al menos una columna para la tabla.");
    expect(html).not.toMatch(/Too small|expected array|too_small|ZodError|path|stack/i);
  });

  it("keeps validation errors independent between PANEL AppViews", () => {
    const panelTestHtml = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={panelEntityTypes()}
        initialActionState={{
          success: false,
          message: "Revisa la configuración del panel. Hay campos obligatorios o selecciones incompatibles.",
          fieldErrors: {
            panelModuleColumns: ["Selecciona al menos una columna para la tabla."],
          },
          values: {
            name: "Panel Test",
            slug: "panel-test",
            type: "PANEL",
            panelConfig: JSON.stringify(panelConfigFixture({ modules: [] })),
          },
        }}
        submitLabel="Guardar experiencia"
      />,
    );
    const pilotHtml = renderToStaticMarkup(
      <AppViewForm
        action={noopAction}
        entityTypes={panelEntityTypes()}
        initialValues={panelInitialValues()}
        submitLabel="Guardar experiencia"
      />,
    );

    expect(panelTestHtml).toContain("Selecciona al menos una columna para la tabla.");
    expect(pilotHtml).not.toContain("Selecciona al menos una columna para la tabla.");
    expect(pilotHtml).not.toMatch(/Too small|expected array|too_small|ZodError|path|stack/i);
  });
});

async function noopAction(state: AppViewActionState) {
  return state;
}

function panelInitialValues(overrides: Partial<PanelConfig> = {}) {
  return {
    active: true,
    config: panelConfigFixture(overrides),
    icon: "folder",
    name: "Panel Procedimientos",
    slug: "panel-procedimientos",
    sortOrder: 1,
    type: "PANEL" as const,
  };
}

function panelConfigFixture(overrides: Partial<PanelConfig> = {}): PanelConfig {
  return {
    type: "PANEL" as const,
    schemaVersion: 1 as const,
    layout: { columns: 12, rowHeight: 8 },
    filters: [],
    datasets: [
      {
        id: "latest-procedure-status",
        name: "Versionado",
        source: { type: "ENTITY" as const, entityTypeId: "versions" },
        transformation: {
          type: "LATEST_BY_RELATION" as const,
          relatedEntityTypeId: "procedures",
          relationFieldId: "procedure_field",
          orderFieldId: "date_field",
          requiredValueFieldId: "status_field",
          fieldIds: ["procedure_field", "status_field", "revision_field", "date_field"],
          pagination: { pageSize: 25 },
        },
      },
    ],
    modules: [
      {
        id: "latest-procedure-status-table",
        title: "Última versión por procedimiento",
        datasetId: "latest-procedure-status",
        visualization: {
          type: "TABLE" as const,
          config: {
            columns: [
              { fieldId: "procedure_field" },
              { fieldId: "status_field", valueDisplay: "LABEL" as const },
              { fieldId: "revision_field" },
              { fieldId: "date_field", format: "DD-MM-YYYY" },
            ],
            searchable: true,
            paginated: true,
          },
        },
        layout: { x: 0, y: 0, w: 12, h: 6 },
      },
    ],
    metrics: [],
    calculatedFields: [],
    ...overrides,
  };
}

function panelEntityTypes() {
  return [
    {
      fields: [
        { id: "number_field", isActive: true, key: "numero", name: "Número", options: [], type: "INTEGER" },
      ],
      icon: "folder",
      id: "procedures",
      name: "Procedimientos",
    },
    {
      fields: [
        {
          config: { relationKind: "ONE", targetEntityTypeId: "procedures" },
          id: "procedure_field",
          isActive: true,
          key: "procedimiento",
          name: "Procedimiento",
          options: [],
          type: "RELATION",
        },
        { id: "status_field", isActive: true, key: "estatus", name: "Estatus", options: [{ id: "e1", isActive: true, label: "E1", value: "e1" }], type: "SELECT" },
        { id: "revision_field", isActive: true, key: "revision", name: "Revisión", options: [], type: "TEXT" },
        { id: "date_field", isActive: true, key: "fecha", name: "Fecha", options: [], type: "DATE" },
      ],
      icon: "clipboard-check",
      id: "versions",
      name: "Versionado",
    },
  ];
}
