import { requireApiUser } from "@/lib/api-auth";
import { success } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResult = await requireApiUser(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  return success({
    app: {
      clientId: authResult.app.clientId,
      id: authResult.app.id,
      name: authResult.app.name,
      slug: authResult.app.slug,
    },
    user: {
      email: authResult.user.email,
      id: authResult.user.id,
      name: authResult.user.name,
    },
  });
}
