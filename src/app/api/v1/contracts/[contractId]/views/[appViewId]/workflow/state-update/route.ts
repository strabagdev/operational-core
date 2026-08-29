import { requireApiContractAccess } from "@/lib/api-auth";
import { applyApiDiagnosticsHeaders, createApiServerTiming } from "@/lib/api-diagnostics";
import { badRequest, success } from "@/lib/api-response";
import {
  getStateUpdateWorkflow,
  saveStateUpdateWorkflow,
} from "@/lib/state-update-workflow";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appViewId: string; contractId: string }> },
) {
  const timing = createApiServerTiming("state-update workflow GET timing");
  const { appViewId, contractId } = await params;
  timing.setScope({ appViewId, contractId });
  timing.mark("params");
  const access = await requireApiContractAccess(request, contractId);
  timing.mark("auth_context");

  if (!access.ok) {
    return applyApiDiagnosticsHeaders(access.response, request, timing.finish("auth_error", access.response.status));
  }

  const searchParams = new URL(request.url).searchParams;
  const result = await getStateUpdateWorkflow({
    appViewId,
    contractId: access.context.contract.id,
    date: searchParams.get("date"),
    search: searchParams.get("search"),
    subjectRecordId: searchParams.get("subjectRecordId"),
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
  const timing = createApiServerTiming("state-update workflow POST timing");
  const { appViewId, contractId } = await params;

  timing.setScope({ appViewId, contractId });
  timing.mark("params");

  try {
    const access = await requireApiContractAccess(request, contractId);

    timing.mark("auth_context");

    if (!access.ok) {
      return applyApiDiagnosticsHeaders(access.response, request, timing.finish("auth_error", access.response.status));
    }

    const body = await readJsonBody(request);

    timing.mark("request_body_parse");

    if (!body.ok) {
      return applyApiDiagnosticsHeaders(body.response, request, timing.finish("invalid_json", body.response.status));
    }

    const result = await saveStateUpdateWorkflow({
      appId: access.context.app.id,
      appViewId,
      body: body.body,
      contractId: access.context.contract.id,
      timing,
      userId: access.context.user.id,
    });

    timing.mark("engine_completed");

    if (!result.ok) {
      return applyApiDiagnosticsHeaders(result.response, request, timing.finish("domain_error", result.response.status));
    }

    const response = success(result.data);

    timing.mark("response_serialization");
    return applyApiDiagnosticsHeaders(response, request, timing.finish("ok", response.status));
  } catch (error) {
    timing.finish("thrown");
    throw error;
  }
}

async function readJsonBody(request: Request) {
  try {
    return { ok: true as const, body: await request.json() };
  } catch {
    return {
      ok: false as const,
      response: badRequest("JSON inválido.", "INVALID_JSON"),
    };
  }
}
