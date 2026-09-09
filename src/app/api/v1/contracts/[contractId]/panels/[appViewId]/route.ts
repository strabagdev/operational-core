import { requireApiContractAccess } from "@/lib/api-auth";
import { success } from "@/lib/api-response";
import { getApiPanel } from "@/lib/panels";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appViewId: string; contractId: string }> },
) {
  const { appViewId, contractId } = await params;
  const access = await requireApiContractAccess(request, contractId);

  if (!access.ok) {
    return access.response;
  }

  const searchParams = new URL(request.url).searchParams;
  const panel = await getApiPanel({
    appViewId,
    contractId: access.context.contract.id,
    query: {
      datasetId: searchParams.get("datasetId"),
      filters: searchParams.get("filters"),
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      search: searchParams.get("search"),
    },
    userId: access.context.user.id,
  });

  if (!panel.ok) {
    return panel.response;
  }

  return success(panel.data);
}
