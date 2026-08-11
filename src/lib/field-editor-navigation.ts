export type FieldEditorMode =
  | { kind: "create" }
  | { kind: "edit"; fieldId: string }
  | { kind: "closed" };

const editorParams = new Set(["createField", "editField"]);

export function getFieldEditorMode(searchParams: {
  createField?: string;
  editField?: string;
}): FieldEditorMode {
  if (searchParams.editField) {
    return { kind: "edit", fieldId: searchParams.editField };
  }

  if (searchParams.createField === "1") {
    return { kind: "create" };
  }

  return { kind: "closed" };
}

export function buildFieldEditorHref({
  basePath,
  currentParams,
  mode,
}: {
  basePath: string;
  currentParams: Record<string, string | undefined>;
  mode: FieldEditorMode;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(currentParams)) {
    if (!value || editorParams.has(key) || key === "error") {
      continue;
    }

    if (key === "notice" && mode.kind !== "closed") {
      continue;
    }

    params.set(key, value);
  }

  if (mode.kind === "create") {
    params.set("createField", "1");
  }

  if (mode.kind === "edit") {
    params.set("editField", mode.fieldId);
  }

  const query = params.toString();

  return query ? `${basePath}?${query}` : basePath;
}
