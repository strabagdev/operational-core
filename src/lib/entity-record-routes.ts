export function entityRecordDetailPath(
  contractId: string,
  entityTypeId: string,
  recordId: string,
) {
  return `/app/contracts/${contractId}/records/${entityTypeId}/${recordId}`;
}

export function entityRecordEditPath(
  contractId: string,
  entityTypeId: string,
  recordId: string,
) {
  return `${entityRecordDetailPath(contractId, entityTypeId, recordId)}?edit=1`;
}

export function entityRecordCancelEditPath(
  contractId: string,
  entityTypeId: string,
  recordId: string,
) {
  return entityRecordDetailPath(contractId, entityTypeId, recordId);
}
