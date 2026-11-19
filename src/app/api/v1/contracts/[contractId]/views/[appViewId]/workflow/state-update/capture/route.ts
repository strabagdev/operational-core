import { badRequest } from "@/lib/api-response";
import { POST as saveStateUpdateCommand } from "../route";
export const runtime = "nodejs";
/** Old servers return 404; a capture command must never fall back to a legacy writer. */
export async function POST(request: Request, context: { params: Promise<{ appViewId: string; contractId: string }> }) {
  let body: unknown;
  try { body = await request.clone().json(); } catch { return badRequest("JSON inválido.", "INVALID_JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !(body as Record<string, unknown>).captureTime) return badRequest("Esta ruta requiere un comando de captura compatible.", "CAPTURE_TIME_COMMAND_REQUIRED");
  return saveStateUpdateCommand(request, context);
}
