import { requireApiContractAccess } from "@/lib/api-auth";
import { getApiContractEntities } from "@/lib/api-entities";
import { success } from "@/lib/api-response";
import { serializeApiEntitySummary } from "@/lib/api-entity-serializer";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contractId: string }> },
) {
  const { contractId } = await params;
  const access = await requireApiContractAccess(request, contractId);

  if (!access.ok) {
    return access.response;
  }

  const entities = await getApiContractEntities(access.context.contract.id);

  return success({
    entities: entities.map(serializeApiEntitySummary),
  });
}
