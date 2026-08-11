import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  EntityImportUserError,
  generateEntityTemplate,
  getEntityImportContext,
  templateFileName,
} from "@/lib/entity-import";

export async function GET(
  _request: Request,
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

  try {
    const context = await getEntityImportContext(contractId, entityTypeId, session.user.id);

    if (!context) {
      notFound();
    }

    const buffer = await generateEntityTemplate({
      entityName: context.entityType.name,
      fields: context.importableFields,
    });

    return new Response(buffer, {
      headers: {
        "Content-Disposition": `attachment; filename="${templateFileName(context.entityType.name)}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
