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
  const { appViewId, contractId } = await params;
  const access = await requireApiContractAccess(request, contractId);

  if (!access.ok) {
    return access.response;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const result = await saveStateUpdateWorkflow({
    appId: access.context.app.id,
    appViewId,
    body: body.body,
    contractId: access.context.contract.id,
    userId: access.context.user.id,
  });

  if (!result.ok) {
    return result.response;
  }

  return success(result.data);
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
