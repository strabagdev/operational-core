export function toggleRecordSelection(selectedIds: string[], recordId: string) {
  return selectedIds.includes(recordId)
    ? selectedIds.filter((id) => id !== recordId)
    : [...selectedIds, recordId];
}

export function toggleAllVisibleSelection(selectedIds: string[], visibleIds: string[]) {
  const selection = getBulkSelectionState(selectedIds, visibleIds);

  return selection.allSelected ? [] : visibleIds;
}

export function getBulkSelectionState(selectedIds: string[], visibleIds: string[]) {
  const visibleSet = new Set(visibleIds);
  const visibleSelectedIds = selectedIds.filter((id) => visibleSet.has(id));
  const selectedCount = visibleSelectedIds.length;

  return {
    allSelected: visibleIds.length > 0 && selectedCount === visibleIds.length,
    indeterminate: selectedCount > 0 && selectedCount < visibleIds.length,
    selectedCount,
    visibleSelectedIds,
  };
}

export function selectionScopeSignature({
  entityTypeId,
  query,
  visibleIds,
}: {
  entityTypeId: string;
  query?: string;
  visibleIds: string[];
}) {
  return `${entityTypeId}:${query ?? ""}:${visibleIds.join("|")}`;
}
