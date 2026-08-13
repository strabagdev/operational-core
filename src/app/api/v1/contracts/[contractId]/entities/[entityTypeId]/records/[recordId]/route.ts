import { requireApiContractAccess } from "@/lib/api-auth";
import {
  apiEntityNotFoundResponse,
  apiRecordNotFoundResponse,
  getApiEntityDefinition,
  getApiEntityRecord,
} from "@/lib/api-entities";
import { success } from "@/lib/api-response";
import { serializeApiEntityRecord } from "@/lib/api-entity-serializer";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      contractId: string;
      entityTypeId: string;
      recordId: string;
    }>;
  },
) {
  const { contractId, entityTypeId, recordId } = await params;
  const access = await requireApiContractAccess(request, contractId);

  if (!access.ok) {
    return access.response;
  }

  const entity = await getApiEntityDefinition(access.context.contract.id, entityTypeId);

  if (!entity) {
    return apiEntityNotFoundResponse();
  }

  const record = await getApiEntityRecord({ entityType: entity, recordId });

  if (!record) {
    return apiRecordNotFoundResponse();
  }

  return success({
    record: serializeApiEntityRecord({
      fields: entity.fields,
      record,
    }),
  });
}
