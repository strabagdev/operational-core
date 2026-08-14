import { requireApiContractAccess } from "@/lib/api-auth";
import {
  apiEntityNotFoundResponse,
  apiRecordNotFoundResponse,
  getApiEntityDefinition,
  getApiEntityRecord,
} from "@/lib/api-entities";
import { badRequest, success } from "@/lib/api-response";
import { serializeApiEntityRecord } from "@/lib/api-entity-serializer";
import { patchApiEntityRecord } from "@/lib/api-record-writes";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      contractId: string;
      entityTypeId: string;
      recordId: string;
    }>;
  },
) {
  const { contractId, entityTypeId, recordId } = await params;
  const access = await requireApiContractAccess(request, contractId);

  if (!access.ok) {
    return access.response;
  }

  const entity = await getApiEntityDefinition(access.context.contract.id, entityTypeId);

  if (!entity) {
    return apiEntityNotFoundResponse();
  }

  const record = await getApiEntityRecord({ entityType: entity, recordId });

  if (!record) {
    return apiRecordNotFoundResponse();
  }

  return success({
    record: serializeApiEntityRecord({
      fields: entity.fields,
      record,
    }),
  });
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      contractId: string;
      entityTypeId: string;
      recordId: string;
    }>;
  },
) {
  const { contractId, entityTypeId, recordId } = await params;
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

  const result = await patchApiEntityRecord({
    appId: access.context.app.id,
    body: body.body,
    contractId: access.context.contract.id,
    entity,
    recordId,
    userId: access.context.user.id,
  });

  if (!result.ok) {
    return result.response;
  }

  const record = await getApiEntityRecord({ entityType: entity, recordId: result.recordId });

  if (!record) {
    return apiRecordNotFoundResponse();
  }

  return success({
    record: serializeApiEntityRecord({
      fields: entity.fields,
      record,
    }),
  });
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
