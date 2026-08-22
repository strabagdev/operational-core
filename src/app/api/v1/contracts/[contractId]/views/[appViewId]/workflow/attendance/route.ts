import { requireApiContractAccess } from "@/lib/api-auth";
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
  const { appViewId, contractId } = await params;
  const access = await requireApiContractAccess(request, contractId);

  if (!access.ok) {
    return access.response;
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

  const result = await saveAttendanceWorkflowDay({
    appId: access.context.app.id,
    appViewId,
    body: await request.json(),
    contractId: access.context.contract.id,
    userId: access.context.user.id,
  });

  if (!result.ok) {
    return result.response;
  }

  return success(result.data);
}
