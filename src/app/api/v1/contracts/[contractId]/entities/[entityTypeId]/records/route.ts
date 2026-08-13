import { requireApiContractAccess } from "@/lib/api-auth";
import {
  apiEntityNotFoundResponse,
  getApiEntityDefinition,
  getApiEntityRecords,
  parseApiRecordListQuery,
} from "@/lib/api-entities";
import { success } from "@/lib/api-response";
import { serializeApiEntityRecord } from "@/lib/api-entity-serializer";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contractId: string; entityTypeId: string }> },
) {
  const { contractId, entityTypeId } = await params;
  const access = await requireApiContractAccess(request, contractId);

  if (!access.ok) {
    return access.response;
  }

  const entity = await getApiEntityDefinition(access.context.contract.id, entityTypeId);

  if (!entity) {
    return apiEntityNotFoundResponse();
  }

  const parsedQuery = parseApiRecordListQuery(
    new URL(request.url).searchParams,
    entity.fields,
  );

  if (!parsedQuery.ok) {
    return parsedQuery.response;
  }

  const data = await getApiEntityRecords({
    entityType: entity,
    query: parsedQuery.query,
  });

  return success({
    pagination: data.pagination,
    records: data.records.map((record) =>
      serializeApiEntityRecord({
        fields: entity.fields,
        record,
      }),
    ),
  });
}
