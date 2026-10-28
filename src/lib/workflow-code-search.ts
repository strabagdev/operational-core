import { Prisma } from "@prisma/client";

export type WorkflowCodeSearch = { fieldId: string };
type SearchField = { id: string; key: string; name: string; type: string; isActive: boolean; searchable: boolean; multiple: boolean };
export function codeSearchField(fields: SearchField[], config?: WorkflowCodeSearch) {
  if (!config) return undefined;
  const field = fields.find(candidate => candidate.id === config.fieldId);
  if (!field || !field.isActive || !field.searchable || field.multiple || !["TEXT", "TEXTAREA"].includes(field.type)) {
    throw new WorkflowCodeSearchError("El campo del lector debe ser un texto activo y buscable de la entidad fuente.");
  }
  return { id: field.id, key: field.key, name: field.name, type: field.type as "TEXT" | "TEXTAREA" };
}
export class WorkflowCodeSearchError extends Error {}

export function requestedCodeSearchField(fields: SearchField[], config?: WorkflowCodeSearch, requested?: string | null) {
  let field;
  try { field = codeSearchField(fields, config); }
  catch (error) { if (requested !== undefined && requested !== null) throw error; }
  if (requested !== undefined && requested !== null && (!requested || requested !== field?.id)) {
    throw new WorkflowCodeSearchError("La búsqueda del lector no corresponde al campo configurado en esta experiencia.");
  }
  return { metadata: field, fieldId: requested ?? undefined };
}

// PostgreSQL LIKE wildcards are literals here, matching Client String.includes.
export function literalCodeSearchText(query: string) { return query.trim().replace(/[\\%_]/g, "\\$&"); }
export function codeSearchRecordWhere(fieldId: string, query: string): Prisma.EntityRecordWhereInput {
  return { values: { some: { entityFieldId: fieldId, textValue: { contains: literalCodeSearchText(query), mode: "insensitive" } } } };
}
