import { requireApiContractAccess } from "@/lib/api-auth";
import {
  apiEntityNotFoundResponse,
  getApiEntityDefinition,
} from "@/lib/api-entities";
import { badRequest, success } from "@/lib/api-response";
import { validateApiRecordUniqueFields } from "@/lib/api-record-unique-validation";

export const runtime = "nodejs";

export async function POST(
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

  const body = await readJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const result = await validateApiRecordUniqueFields({
    body: body.body,
    entity,
  });

  if (!result.ok) {
    return badRequest(result.message, result.code);
  }

  return success(result.result);
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
