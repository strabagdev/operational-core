import { requireApiContractAccess } from "@/lib/api-auth";
import { applyApiDiagnosticsHeaders, createApiServerTiming } from "@/lib/api-diagnostics";
import {
  getAttendanceWorkflowDay,
  saveAttendanceWorkflowDay,
} from "@/lib/attendance-workflow";
import { success } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appViewId: string; contractId: string }> },
) {
  const timing = createApiServerTiming("attendance workflow GET timing");
  const { appViewId, contractId } = await params;
  timing.setScope({ appViewId, contractId });
  timing.mark("params");
  const access = await requireApiContractAccess(request, contractId);
  timing.mark("auth_context");

  if (!access.ok) {
    return applyApiDiagnosticsHeaders(access.response, request, timing.finish("auth_error", access.response.status));
  }

  const searchParams = new URL(request.url).searchParams;
  const result = await getAttendanceWorkflowDay({
    appViewId,
    contractId: access.context.contract.id,
    date: searchParams.get("date"),
    personRecordId: searchParams.get("personRecordId"),
    search: searchParams.get("search"),
    userId: access.context.user.id,
  });
  timing.mark("workflow_completed");

  if (!result.ok) {
    return applyApiDiagnosticsHeaders(result.response, request, timing.finish("domain_error", result.response.status));
  }

  const response = success(result.data);

  timing.mark("response_serialization");

  return applyApiDiagnosticsHeaders(response, request, timing.finish("ok", response.status));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appViewId: string; contractId: string }> },
) {
  const timing = createApiServerTiming("attendance workflow POST timing");
  const { appViewId, contractId } = await params;
  timing.setScope({ appViewId, contractId });
  timing.mark("params");
  const access = await requireApiContractAccess(request, contractId);
  timing.mark("auth_context");

  if (!access.ok) {
    return applyApiDiagnosticsHeaders(access.response, request, timing.finish("auth_error", access.response.status));
  }

  const result = await saveAttendanceWorkflowDay({
    appId: access.context.app.id,
    appViewId,
    body: await request.json(),
    contractId: access.context.contract.id,
    userId: access.context.user.id,
  });
  timing.mark("workflow_completed");

  if (!result.ok) {
    return applyApiDiagnosticsHeaders(result.response, request, timing.finish("domain_error", result.response.status));
  }

  const response = success(result.data);

  timing.mark("response_serialization");

  return applyApiDiagnosticsHeaders(response, request, timing.finish("ok", response.status));
}
