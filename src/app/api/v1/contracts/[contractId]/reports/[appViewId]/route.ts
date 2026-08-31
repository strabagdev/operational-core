import { requireApiContractAccess } from "@/lib/api-auth";
import { getApiReport } from "@/lib/api-reports";
import { success } from "@/lib/api-response";

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
  const report = await getApiReport({
    appViewId,
    contractId: access.context.contract.id,
    query: {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    },
    userId: access.context.user.id,
  });

  if (!report.ok) {
    return report.response;
  }

  return success(report.data);
}
