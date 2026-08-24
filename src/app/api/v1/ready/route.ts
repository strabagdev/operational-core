import { checkPrismaReadiness } from "@/lib/prisma-resilience";

export const runtime = "nodejs";

export async function GET() {
  const readiness = await checkPrismaReadiness();

  if (!readiness.ok) {
    return Response.json(
      { reason: readiness.reason, status: "not_ready" },
      { status: 503 },
    );
  }

  return Response.json({ status: "ready" });
}
