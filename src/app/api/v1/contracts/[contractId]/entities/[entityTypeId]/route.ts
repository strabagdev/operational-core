import { requireApiContractAccess } from "@/lib/api-auth";
import {
  apiEntityNotFoundResponse,
  getApiEntityDefinition,
} from "@/lib/api-entities";
import { success } from "@/lib/api-response";
import { serializeApiEntityDefinition } from "@/lib/api-entity-serializer";

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

  return success({
    entity: serializeApiEntityDefinition(entity),
  });
}
