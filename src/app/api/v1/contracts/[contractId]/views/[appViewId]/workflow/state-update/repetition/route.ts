import { badRequest } from "@/lib/api-response";
import { POST as saveStateUpdateCommand } from "../route";

export const runtime = "nodejs";

/** A fail-closed address for repeat commands; Core versions without repetition return 404, never legacy update-current. */
export async function POST(request: Request, context: { params: Promise<{ appViewId: string; contractId: string }> }) {
  let body: unknown;
  try { body = await request.clone().json(); }
  catch { return badRequest("JSON inválido.","INVALID_JSON"); }
  if (!body || typeof body!=="object" || Array.isArray(body) || !["MULTIPLE","MULTIPLE_WITH_WARNING"].includes(String((body as Record<string,unknown>).repetitionPolicy))) {
    return badRequest("Esta ruta requiere un comando de repetición explícito.","ATTENDANCE_REPETITION_COMMAND_REQUIRED");
  }
  // The existing handler still owns authentication, permissions, policy/base checks, locks, audit and idempotency.
  return saveStateUpdateCommand(request,context);
}
