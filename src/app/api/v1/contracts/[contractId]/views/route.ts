import { requireApiContractAccess } from "@/lib/api-auth";
import { getApiContractViews, serializeApiAppViews } from "@/lib/api-app-views";
import { success } from "@/lib/api-response";

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

  const views = await getApiContractViews({
    contractId: access.context.contract.id,
    userId: access.context.user.id,
  });

  return success({
    views: serializeApiAppViews(views),
  });
}
