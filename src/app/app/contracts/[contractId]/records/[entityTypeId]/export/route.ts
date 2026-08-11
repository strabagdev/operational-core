import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  EntityImportUserError,
  exportFileName,
  generateEntityExport,
} from "@/lib/entity-import";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ contractId: string; entityTypeId: string }>;
  },
) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId, entityTypeId } = await params;
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;
  const sort = url.searchParams.get("sort") ?? undefined;
  const dir = url.searchParams.get("dir") ?? undefined;

  try {
    const result = await generateEntityExport({
      contractId,
      entityTypeId,
      query,
      sort: { key: sort, direction: dir },
      userId: session.user.id,
    });

    if (!result) {
      notFound();
    }

    return new Response(result.buffer, {
      headers: {
        "Content-Disposition": `attachment; filename="${exportFileName(result.entityName)}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Operational-Core-Export-Count": String(result.count),
      },
    });
  } catch (error) {
    if (error instanceof EntityImportUserError) {
      redirect(
        `/app/contracts/${contractId}/records/${entityTypeId}?error=${encodeURIComponent(error.message)}`,
      );
    }

    throw error;
  }
}
