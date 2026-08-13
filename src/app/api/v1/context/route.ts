import { getApiOperationalContext, requireApiUser } from "@/lib/api-auth";
import { success } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResult = await requireApiUser(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  const contextResult = await getApiOperationalContext(authResult.user.id);

  if (!contextResult.ok) {
    return contextResult.response;
  }

  return success(contextResult.context);
}
