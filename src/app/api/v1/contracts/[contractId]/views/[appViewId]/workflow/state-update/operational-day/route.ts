import { badRequest } from "@/lib/api-response";
import { POST as save } from "../route";
export const runtime = "nodejs";
/** A previous Core returns 404/405. Never send this intent to a legacy writer. */
export async function POST(request: Request, context: { params: Promise<{ appViewId: string; contractId: string }> }) {
  let body: unknown;
  try { body = await request.clone().json(); } catch { return badRequest("JSON inválido.", "INVALID_JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !(body as Record<string, unknown>).operationalDay) return badRequest("Esta ruta requiere el calendario original de la intención.", "OPERATIONAL_DAY_COMMAND_REQUIRED");
  return save(request, context);
}
