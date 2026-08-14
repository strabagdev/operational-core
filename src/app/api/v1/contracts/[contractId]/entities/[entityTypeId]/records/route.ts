import { requireApiContractAccess } from "@/lib/api-auth";
import {
  apiEntityNotFoundResponse,
  getApiEntityDefinition,
  getApiEntityRecords,
  getApiEntityRecord,
  parseApiRecordListQuery,
} from "@/lib/api-entities";
import { badRequest, success } from "@/lib/api-response";
import { serializeApiEntityRecord } from "@/lib/api-entity-serializer";
import { createApiEntityRecord } from "@/lib/api-record-writes";

export const runtime = "nodejs";

export async function GET(
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

  const parsedQuery = parseApiRecordListQuery(
    new URL(request.url).searchParams,
    entity.fields,
  );

  if (!parsedQuery.ok) {
    return parsedQuery.response;
  }

  const data = await getApiEntityRecords({
    entityType: entity,
    query: parsedQuery.query,
  });

  return success({
    pagination: data.pagination,
    records: data.records.map((record) =>
      serializeApiEntityRecord({
        fields: entity.fields,
        record,
      }),
    ),
  });
}

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

  const result = await createApiEntityRecord({
    appId: access.context.app.id,
    body: body.body,
    contractId: access.context.contract.id,
    entity,
    userId: access.context.user.id,
  });

  if (!result.ok) {
    return result.response;
  }

  const record = await getApiEntityRecord({ entityType: entity, recordId: result.recordId });

  if (!record) {
    return badRequest("No se pudo cargar el registro creado.", "RECORD_WRITE_FAILED");
  }

  return success(
    {
      record: serializeApiEntityRecord({
        fields: entity.fields,
        record,
      }),
    },
    { status: result.replay ? 200 : 201 },
  );
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
