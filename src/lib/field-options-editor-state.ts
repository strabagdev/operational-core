import {
  MAX_FIELD_OPTIONS,
  normalizeFieldKey,
  type FieldOptionDraft,
} from "./field-editor-state";

export type FieldOptionEditorRow = FieldOptionDraft & {
  rowKey: string;
  hasValues?: boolean;
  usageCount?: number;
  valueTouched?: boolean;
  editing?: boolean;
};

export type BulkOptionsResult = {
  detectedCount: number;
  duplicateCount: number;
  limitExceeded: boolean;
  rows: FieldOptionEditorRow[];
};

export function createOptionRow(
  label = "",
  overrides: Partial<FieldOptionEditorRow> = {},
): FieldOptionEditorRow {
  return {
    rowKey: overrides.rowKey ?? createRowKey(),
    label,
    value: overrides.value ?? normalizeFieldKey(label),
    sortOrder: overrides.sortOrder ?? 1,
    isActive: overrides.isActive ?? true,
    id: overrides.id,
    hasValues: overrides.hasValues,
    valueTouched: overrides.valueTouched ?? false,
    editing: overrides.editing ?? true,
  };
}

export function initialOptionRows(
  options?: Array<FieldOptionDraft & { id?: string; hasValues?: boolean; usageCount?: number; editing?: boolean }>,
) {
  return (options ?? []).map((option) => ({
    ...option,
    rowKey: option.id ?? createRowKey(),
    valueTouched: true,
    editing: option.editing ?? false,
  }));
}

export function updateOptionLabel(
  row: FieldOptionEditorRow,
  label: string,
): FieldOptionEditorRow {
  return {
    ...row,
    label,
    value: row.valueTouched ? row.value : normalizeFieldKey(label),
  };
}

export function updateOptionValue(
  row: FieldOptionEditorRow,
  value: string,
): FieldOptionEditorRow {
  return {
    ...row,
    value: normalizeFieldKey(value),
    valueTouched: true,
  };
}

export function moveOption(
  rows: FieldOptionEditorRow[],
  index: number,
  direction: -1 | 1,
) {
  const target = index + direction;

  if (target < 0 || target >= rows.length) {
    return rows;
  }

  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];

  return normalizeOptionOrder(next);
}

export function removeNewOption(rows: FieldOptionEditorRow[], rowKey: string) {
  return normalizeOptionOrder(rows.filter((row) => row.id || row.rowKey !== rowKey));
}

export function removePersistedOption(rows: FieldOptionEditorRow[], rowKey: string) {
  return normalizeOptionOrder(rows.filter((row) => row.rowKey !== rowKey));
}

export function toggleOptionActive(rows: FieldOptionEditorRow[], rowKey: string) {
  return rows.map((row) =>
    row.rowKey === rowKey ? { ...row, isActive: !row.isActive } : row,
  );
}

export function filterOptionRows(rows: FieldOptionEditorRow[], query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return rows;
  }

  return rows.filter(
    (row) =>
      row.label.toLowerCase().includes(normalized) ||
      row.value.toLowerCase().includes(normalized),
  );
}

export function getOptionSummary(rows: FieldOptionEditorRow[]) {
  const activeCount = rows.filter((row) => row.isActive).length;

  return {
    totalCount: rows.length,
    activeCount,
    inactiveCount: rows.length - activeCount,
  };
}

export function parseBulkOptions(
  text: string,
  existingRows: FieldOptionEditorRow[],
): BulkOptionsResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const seenLabels = new Set(existingRows.map((row) => normalizeOptionLabel(row.label)));
  const seenValues = new Set(existingRows.map((row) => row.value.trim().toLowerCase()));
  const rows: FieldOptionEditorRow[] = [];
  let duplicateCount = 0;

  for (const label of lines) {
    const normalizedLabel = normalizeOptionLabel(label);
    const value = normalizeFieldKey(label);
    const normalizedValue = value.toLowerCase();

    if (seenLabels.has(normalizedLabel) || seenValues.has(normalizedValue)) {
      duplicateCount += 1;
      continue;
    }

    seenLabels.add(normalizedLabel);
    seenValues.add(normalizedValue);
    rows.push(createOptionRow(label, { value, editing: false }));
  }

  return {
    detectedCount: lines.length,
    duplicateCount,
    limitExceeded:
      lines.length > MAX_FIELD_OPTIONS ||
      existingRows.length + rows.length > MAX_FIELD_OPTIONS,
    rows,
  };
}

export function getDuplicateOptionErrors(rows: FieldOptionEditorRow[]) {
  const labelOwners = new Map<string, string>();
  const valueOwners = new Map<string, string>();
  const errors: Record<string, string> = {};

  for (const row of rows) {
    const label = normalizeOptionLabel(row.label);
    const value = row.value.trim().toLowerCase();

    if (label) {
      const owner = labelOwners.get(label);

      if (owner) {
        errors[row.rowKey] = "Ya existe una opción con esta etiqueta.";
        errors[owner] = errors[owner] ?? "Ya existe una opción con esta etiqueta.";
      } else {
        labelOwners.set(label, row.rowKey);
      }
    }

    if (value) {
      const owner = valueOwners.get(value);

      if (owner) {
        errors[row.rowKey] = "Ya existe una opción con este valor interno.";
        errors[owner] = errors[owner] ?? "Ya existe una opción con este valor interno.";
      } else {
        valueOwners.set(value, row.rowKey);
      }
    }
  }

  return errors;
}

export function normalizeOptionLabel(label: string) {
  return label.trim().toLowerCase();
}

function normalizeOptionOrder(rows: FieldOptionEditorRow[]) {
  return rows.map((row, index) => ({
    ...row,
    sortOrder: index + 1,
  }));
}

function createRowKey() {
  return globalThis.crypto?.randomUUID?.() ?? `option_${Date.now()}_${Math.random()}`;
}
