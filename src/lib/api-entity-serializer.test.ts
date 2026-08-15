import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  serializeApiEntityDefinition,
  serializeApiEntityRecord,
  serializeApiEntitySummary,
} from "./api-entity-serializer";

function entity(overrides: Record<string, unknown> = {}) {
  return {
    icon: null,
    id: "entity_1",
    isActive: true,
    name: "Equipos",
    nature: "MASTER" as const,
    slug: "equipos",
    ...overrides,
  };
}

function field(overrides: Record<string, unknown> = {}) {
  return {
    config: null,
    id: String(overrides.id ?? "field_text"),
    isActive: overrides.isActive ?? true,
    isUnique: false,
    key: String(overrides.key ?? "codigo"),
    multiple: false,
    name: String(overrides.name ?? "Código"),
    options: [],
    required: false,
    searchable: false,
    sortOrder: Number(overrides.sortOrder ?? 1),
    type: overrides.type ?? "TEXT",
    ...overrides,
  } as never;
}

function record(values: unknown[] = [], outgoingRelations: unknown[] = []) {
  return {
    displayName: "EQ-001",
    id: "record_1",
    outgoingRelations,
    values,
  } as never;
}

describe("API entity serializers", () => {
  it("serializes entity summaries without Prisma internals", () => {
    expect(serializeApiEntitySummary(entity())).toEqual({
      active: true,
      icon: null,
      id: "entity_1",
      name: "Equipos",
      nature: "MASTER",
      slug: "equipos",
    });
  });

  it("serializes entity icon keys and nature for external clients", () => {
    expect(serializeApiEntitySummary(entity({ icon: "warehouse", nature: "TRANSACTION" }))).toMatchObject({
      icon: "warehouse",
      nature: "TRANSACTION",
    });
  });

  it("serializes active fields, options, money and relation metadata", () => {
    expect(
      serializeApiEntityDefinition({
        ...entity(),
        fields: [
          field({ id: "inactive", isActive: false, key: "inactivo", name: "Inactivo" }),
          field({
            config: { money: { currency: "UF" }, validation: { minimum: 0 } },
            id: "price",
            key: "precio",
            name: "Precio",
            sortOrder: 1,
            type: "MONEY",
          }),
          field({
            id: "status",
            key: "estado",
            name: "Estado",
            options: [
              { id: "opt_1", isActive: true, label: "Activo", sortOrder: 1, value: "activo" },
            ],
            sortOrder: 2,
            type: "SELECT",
          }),
          field({
            config: { relationKind: "MANY", targetEntityTypeId: "entity_target" },
            id: "owner",
            key: "responsables",
            multiple: true,
            name: "Responsables",
            sortOrder: 3,
            type: "RELATION",
          }),
        ],
      } as never),
    ).toMatchObject({
      fields: [
        {
          config: {
            money: { currency: "UF" },
            validation: { minimum: 0 },
          },
          key: "precio",
          type: "MONEY",
        },
        {
          key: "estado",
          options: [
            { active: true, id: "opt_1", label: "Activo", order: 1, value: "activo" },
          ],
          type: "SELECT",
        },
        {
          config: {
            relation: {
              relationKind: "MANY",
              targetEntityTypeId: "entity_target",
            },
          },
          key: "responsables",
          type: "RELATION",
        },
      ],
    });
  });

  it("serializes record values by field key and preserves JSON-safe types", () => {
    const fields = [
      field({ id: "text", key: "texto", type: "TEXT" }),
      field({ id: "integer", key: "entero", type: "INTEGER" }),
      field({ id: "decimal", key: "decimal", type: "DECIMAL" }),
      field({ id: "boolean", key: "booleano", type: "BOOLEAN" }),
      field({ id: "date", key: "fecha", type: "DATE" }),
      field({ id: "datetime", key: "fecha_hora", type: "DATETIME" }),
      field({ id: "select", key: "estado", type: "SELECT" }),
      field({ id: "multi", key: "etiquetas", type: "MULTISELECT" }),
      field({ id: "file", key: "archivo", type: "FILE" }),
    ];

    expect(
      serializeApiEntityRecord({
        fields,
        record: record([
          { entityFieldId: "text", textValue: "Texto" },
          { entityFieldId: "integer", integerValue: 42 },
          { decimalValue: new Prisma.Decimal("1234567890.123456"), entityFieldId: "decimal" },
          { booleanValue: false, entityFieldId: "boolean" },
          { dateValue: new Date("2026-08-13T12:34:56.000Z"), entityFieldId: "date" },
          { dateValue: new Date("2026-08-13T12:34:56.000Z"), entityFieldId: "datetime" },
          { entityFieldId: "select", textValue: "activo" },
          { entityFieldId: "multi", jsonValue: ["a", "b"] },
          { entityFieldId: "file", jsonValue: { name: "manual.pdf" } },
        ]),
      }),
    ).toEqual({
      displayName: "EQ-001",
      id: "record_1",
      values: {
        archivo: { name: "manual.pdf" },
        booleano: false,
        decimal: "1234567890.123456",
        entero: 42,
        estado: "activo",
        etiquetas: ["a", "b"],
        fecha: "2026-08-13",
        fecha_hora: "2026-08-13T12:34:56.000Z",
        texto: "Texto",
      },
    });
  });

  it("serializes relation fields as clean record references", () => {
    const fields = [
      field({
        config: { relationKind: "MANY", targetEntityTypeId: "people" },
        id: "relation",
        key: "responsables",
        multiple: true,
        type: "RELATION",
      }),
    ];

    expect(
      serializeApiEntityRecord({
        fields,
        record: record([], [
          {
            sourceFieldId: "relation",
            targetRecord: {
              displayName: "Persona 1",
              entityTypeId: "people",
              id: "person_1",
            },
            targetRecordId: "person_1",
          },
        ]),
      }),
    ).toEqual({
      displayName: "EQ-001",
      id: "record_1",
      values: {
        responsables: [
          {
            displayName: "Persona 1",
            entityTypeId: "people",
            id: "person_1",
          },
        ],
      },
    });
  });
});
