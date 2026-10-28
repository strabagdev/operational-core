import { expect, it } from "vitest";
import { codeSearchField, codeSearchRecordWhere, literalCodeSearchText, requestedCodeSearchField } from "./workflow-code-search";
const field = { id: "stable-source-field", key: "identifier", name: "Identificador", type: "TEXT", isActive: true, searchable: true, multiple: false };
it("resolves a stable source field without using labels or assuming an identifier format", () => {
  expect(codeSearchField([field], { fieldId: field.id })).toEqual({ id: field.id, key: field.key, name: field.name, type: "TEXT" });
  expect(codeSearchField([], undefined)).toBeUndefined();
});
it.each([{ isActive: false }, { searchable: false }, { multiple: true }, { type: "INTEGER" }, { id: "other-entity-field" }])("rejects unavailable or incompatible configured fields", change => {
  expect(() => codeSearchField([{ ...field, ...change }], { fieldId: field.id })).toThrow();
});
it("keeps manual search available if the optional reader field becomes invalid, but never falls back for a field request", () => {
  expect(requestedCodeSearchField([], { fieldId: field.id })).toEqual({ metadata: undefined, fieldId: undefined });
  expect(() => requestedCodeSearchField([], { fieldId: field.id }, field.id)).toThrow();
  expect(() => requestedCodeSearchField([field], undefined, field.id)).toThrow();
  expect(() => requestedCodeSearchField([field], { fieldId: field.id }, "wrong")).toThrow();
});
it("uses a literal insensitive substring on the configured text field, without number or punctuation normalization", () => {
  expect(literalCodeSearchText(" 00.123.450-K ")).toBe("00.123.450-K");
  expect(literalCodeSearchText("EQ_01%\\")).toBe("EQ\\_01\\%\\\\");
  expect(codeSearchRecordWhere(field.id, " 00.123.450-K ")).toEqual({ values: { some: { entityFieldId: field.id, textValue: { contains: "00.123.450-K", mode: "insensitive" } } } });
});
