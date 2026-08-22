import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EntityRecordsTable, recordRowClassName } from "./entity-records-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe("EntityRecordsTable", () => {
  it("renders only configured field columns and links the first visible field", () => {
    const html = renderToStaticMarkup(
      <EntityRecordsTable
        contractId="contract_1"
        deleteAction={async () => ({ success: true, message: "ok" })}
        entityTypeId="attendance"
        listFields={[
          { id: "person_field", name: "Persona" },
          { id: "date_field", name: "Fecha" },
          { id: "status_field", name: "Estado" },
        ]}
        records={[
          {
            displayName: "Registro sin nombre",
            id: "attendance_1",
            values: [
              { fieldId: "person_field", value: "Juan Pérez" },
              { fieldId: "date_field", value: "22-08-2026" },
              { fieldId: "status_field", value: "Presente" },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain(">Persona<");
    expect(html).toContain(">Fecha<");
    expect(html).toContain(">Estado<");
    expect(html).not.toContain(">Nombre<");
    expect(html).toContain("/app/contracts/contract_1/records/attendance/attendance_1");
    expect(html).toContain(">Juan Pérez</a>");
    expect(html).not.toContain(">Registro sin nombre</a>");
  });

  it("keeps records navigable when no configured fields are visible", () => {
    const html = renderToStaticMarkup(
      <EntityRecordsTable
        contractId="contract_1"
        deleteAction={async () => ({ success: true, message: "ok" })}
        entityTypeId="attendance"
        listFields={[]}
        records={[
          {
            displayName: "Registro sin nombre",
            id: "attendance_1",
            values: [],
          },
        ]}
      />,
    );

    expect(html).not.toContain(">Nombre<");
    expect(html).toContain(">Ver</a>");
    expect(html).toContain("/app/contracts/contract_1/records/attendance/attendance_1");
  });

  it("marks highlighted rows with the new-record highlight class", () => {
    expect(recordRowClassName(true)).toContain("record-new-highlight");
    expect(recordRowClassName(false)).not.toContain("record-new-highlight");
  });
});
