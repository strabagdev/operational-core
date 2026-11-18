import type { DatasetDefinition } from "./app-views";

export function panelCountFields(dataset: Pick<DatasetDefinition, "relationCounts">) {
  return (dataset.relationCounts ?? []).flatMap(count => [
    { id: `count:${count.id}`, name: count.label, type: "INTEGER" as const, emptyLabel: undefined as string | undefined },
    ...(count.difference ? [{ id: `difference:${count.id}`, name: count.difference.label, type: "DECIMAL" as const, emptyLabel: count.difference.emptyLabel }] : []),
  ]);
}

/** Complete groups are paginated, never split by a record page. IDs, never labels, identify groups. */
export function groupPanelRecords<T extends { id: string; outgoingRelations: { sourceFieldId: string; targetRecordId: string; targetRecord: { displayName: string } }[] }>(records: T[], relationFieldId: string) {
  const groups = new Map<string, { key: string; relationRecordId: string | null; displayName: string; count: number; recordIds: string[] }>();
  for (const record of new Map(records.map(record => [record.id, record])).values()) {
    const relations = record.outgoingRelations.filter(link => link.sourceFieldId === relationFieldId);
    const targets = new Set(relations.map(link => link.targetRecordId));
    if (targets.size > 1) throw new Error("PANEL_GROUP_RELATION_INVALID");
    const relationRecordId = relations[0]?.targetRecordId ?? null;
    const key = relationRecordId ? `relation:${relationRecordId}` : `unrelated:${record.id}`;
    const group = groups.get(key) ?? { key, relationRecordId, displayName: relations[0]?.targetRecord.displayName || "Sin relación definida", count: 0, recordIds: [] };
    group.recordIds.push(record.id); group.count += 1; groups.set(key, group);
  }
  return [...groups.values()];
}
