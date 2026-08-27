import { createHash } from "node:crypto";

import { requireApiContractAccess } from "@/lib/api-auth";
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
  const { appViewId, contractId } = await params;
  const access = await requireApiContractAccess(request, contractId);

  if (!access.ok) {
    return access.response;
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

  if (!result.ok) {
    return result.response;
  }

  return success(result.data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appViewId: string; contractId: string }> },
) {
  const timing = createStateUpdateRouteTiming();
  const { appViewId, contractId } = await params;

  timing.setScope({ appViewId, contractId });
  timing.mark("params");

  try {
    const access = await requireApiContractAccess(request, contractId);

    timing.mark("auth_context");

    if (!access.ok) {
      timing.finish("auth_error", access.response.status);
      return access.response;
    }

    const body = await readJsonBody(request);

    timing.mark("request_body_parse");

    if (!body.ok) {
      timing.finish("invalid_json", body.response.status);
      return body.response;
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
      timing.finish("domain_error", result.response.status);
      return result.response;
    }

    const response = success(result.data);

    timing.mark("response_serialization");
    timing.finish("ok", response.status);

    return response;
  } catch (error) {
    timing.finish("thrown");
    throw error;
  }
}

function createStateUpdateRouteTiming() {
  const startedAt = Date.now();
  const phases: Record<string, number> = {};
  let scope: { appView: string; contract: string } = { appView: "unknown", contract: "unknown" };

  return {
    finish(result: string, status?: number) {
      const totalDurationMs = Date.now() - startedAt;

      console.info("state-update workflow POST timing", {
        appView: scope.appView,
        contract: scope.contract,
        phases,
        result,
        status: status ?? null,
        totalDurationMs,
      });
    },
    mark(phase: string) {
      phases[phase] = Date.now() - startedAt;
    },
    setScope(nextScope: { appViewId: string; contractId: string }) {
      scope = {
        appView: fingerprint(nextScope.appViewId),
        contract: fingerprint(nextScope.contractId),
      };
    },
  };
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
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
