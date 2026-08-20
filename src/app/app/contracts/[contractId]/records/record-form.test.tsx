import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { RecordForm } from "./record-form";

function selectField() {
  return {
    id: "field_status",
    name: "Estado",
    description: null,
    type: "SELECT" as const,
    required: false,
    config: null,
    options: [
      { label: "Operativo", value: "operativo", isActive: true },
      { label: "Retirado", value: "retirado", isActive: false },
    ],
  };
}

describe("record form options", () => {
  it("hides inactive options for new records", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        action={async () => undefined}
        fields={[selectField()]}
        relationOptions={{}}
        submitLabel="Crear registro"
      />,
    );

    expect(html).toContain("Operativo");
    expect(html).not.toContain("Retirado");
  });

  it("keeps a used inactive option visible in historical record edits", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        action={async () => undefined}
        fields={[selectField()]}
        relationOptions={{}}
        submitLabel="Guardar registro"
        values={[
          {
            entityFieldId: "field_status",
            textValue: "retirado",
            integerValue: null,
            decimalValue: null,
            booleanValue: null,
            dateValue: null,
            jsonValue: null,
          },
        ]}
      />,
    );

    expect(html).toContain("Operativo");
    expect(html).toContain("Retirado");
    expect(html).toContain('value="retirado" selected=""');
  });

  it("uses submitted values after a validation error", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        action={async () => undefined}
        fields={[selectField()]}
        formValues={{ field_status: ["operativo"] }}
        relationOptions={{}}
        submitLabel="Guardar cambios"
        values={[
          {
            entityFieldId: "field_status",
            textValue: "retirado",
            integerValue: null,
            decimalValue: null,
            booleanValue: null,
            dateValue: null,
            jsonValue: null,
          },
        ]}
      />,
    );

    expect(html).toContain('value="operativo" selected=""');
  });

  it("renders DATE values as the same calendar day in edit mode", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        action={async () => undefined}
        fields={[
          {
            id: "field_date",
            name: "Fecha",
            description: null,
            type: "DATE",
            required: false,
            config: null,
            options: [],
          },
        ]}
        relationOptions={{}}
        submitLabel="Guardar cambios"
        values={[
          {
            entityFieldId: "field_date",
            textValue: null,
            integerValue: null,
            decimalValue: null,
            booleanValue: null,
            dateValue: new Date("2026-01-21T00:00:00.000Z"),
            jsonValue: null,
          },
        ]}
      />,
    );

    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-01-21"');
  });

  it("renders TIME values with a native time input", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        action={async () => undefined}
        fields={[
          {
            id: "field_time",
            name: "Hora inicio",
            description: null,
            type: "TIME",
            required: false,
            config: null,
            options: [],
          },
        ]}
        relationOptions={{}}
        submitLabel="Guardar cambios"
        values={[
          {
            entityFieldId: "field_time",
            textValue: "08:30",
            integerValue: null,
            decimalValue: null,
            booleanValue: null,
            dateValue: null,
            jsonValue: null,
          },
        ]}
      />,
    );

    expect(html).toContain('type="time"');
    expect(html).toContain('value="08:30"');
  });

  it("renders MONEY inputs with clean numeric values and currency indicator", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        action={async () => undefined}
        fields={[
          {
            id: "field_money",
            name: "Monto neto",
            description: null,
            type: "MONEY",
            required: false,
            config: { money: { currency: "CLP" } },
            options: [],
          },
        ]}
        relationOptions={{}}
        submitLabel="Guardar cambios"
        values={[
          {
            entityFieldId: "field_money",
            textValue: null,
            integerValue: null,
            decimalValue: new Prisma.Decimal("5269808713"),
            booleanValue: null,
            dateValue: null,
            jsonValue: null,
          },
        ]}
      />,
    );

    expect(html).toContain('type="number"');
    expect(html).toContain('value="5269808713"');
    expect(html).toContain("CLP");
    expect(html).not.toContain("$5.269.808.713");
  });

  it("submits explicit false for unchecked boolean fields", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        action={async () => undefined}
        fields={[
          {
            id: "field_active",
            name: "Activo",
            description: null,
            type: "BOOLEAN",
            required: false,
            config: null,
            options: [],
          },
        ]}
        relationOptions={{}}
        submitLabel="Crear registro"
      />,
    );

    expect(html).toContain('type="hidden" name="field_field_active" value="false"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
  });

  it("submits relation targetRecordId values instead of display names", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        action={async () => undefined}
        fields={[
          {
            id: "field_department",
            name: "Departamento",
            description: null,
            type: "RELATION",
            required: false,
            config: { targetEntityTypeId: "departments", relationKind: "ONE" },
            options: [],
          },
        ]}
        relationOptions={{
          field_department: [
            {
              displayName: "Bodega",
              entityTypeName: "Departamentos",
              id: "target_record_1",
            },
          ],
        }}
        submitLabel="Crear registro"
      />,
    );

    expect(html).toContain('name="field_field_department"');
    expect(html).toContain('value="target_record_1"');
    expect(html).toContain(">Bodega</option>");
    expect(html).not.toContain('value="Bodega"');
  });

  it("submits multiple relation targetRecordId values for MANY relations", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        action={async () => undefined}
        fields={[
          {
            id: "field_departments",
            name: "Departamentos",
            description: null,
            type: "RELATION",
            required: false,
            config: { targetEntityTypeId: "departments", relationKind: "MANY" },
            options: [],
          },
        ]}
        relationOptions={{
          field_departments: [
            {
              displayName: "Bodega",
              entityTypeName: "Departamentos",
              id: "target_record_1",
            },
            {
              displayName: "Minería",
              entityTypeName: "Departamentos",
              id: "target_record_2",
            },
          ],
        }}
        submitLabel="Crear registro"
      />,
    );

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="field_field_departments"');
    expect(html).toContain('value="target_record_1"');
    expect(html).toContain('value="target_record_2"');
    expect(html).not.toContain('value="Bodega"');
    expect(html).not.toContain('value="Minería"');
  });
});
