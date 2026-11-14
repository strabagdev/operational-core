import { revisionBoundRead } from "@/lib/revision-bound-read";
import { requireApiContractAccess } from "@/lib/api-auth";
import { getApiContractViews, serializeApiAppViews } from "@/lib/api-app-views";
import { success } from "@/lib/api-response";

export const runtime = "nodejs";

async function legacyGET(
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

export async function GET(request: Request, context: { params: Promise<{ contractId: string }> }) {
  return revisionBoundRead(request, { kind: "views", ...await context.params }, () => legacyGET(request, context));
}
