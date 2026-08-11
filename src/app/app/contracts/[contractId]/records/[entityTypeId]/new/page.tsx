import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAuthorizedRecordEntityType,
  getRelationOptions,
} from "@/lib/entity-records";

import { createEntityRecordAction } from "../../actions";
import { RecordForm } from "../../record-form";

export default async function NewEntityRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string; entityTypeId: string }>;
  searchParams: Promise<{ error?: string; fieldErrors?: string; formValues?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId, entityTypeId } = await params;
  const data = await getAuthorizedRecordEntityType(
    contractId,
    entityTypeId,
    session.user.id,
  );
  const relationOptions = await getRelationOptions(
    contractId,
    entityTypeId,
    session.user.id,
  );

  if (!data || !relationOptions) {
    notFound();
  }

  const { error, fieldErrors, formValues } = await searchParams;
  const parsedFieldErrors = parseFieldErrors(fieldErrors);
  const parsedFormValues = parseFormValues(formValues);

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Crear registro</h1>
          <p className="text-sm text-muted-foreground">{data.entityType.name}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/contracts/${contractId}/records/${entityTypeId}`}>
            Volver
          </Link>
        </Button>
      </header>

      {error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos del registro</CardTitle>
        </CardHeader>
        <CardContent>
          <RecordForm
            action={createEntityRecordAction.bind(null, contractId, entityTypeId)}
            fieldErrors={parsedFieldErrors}
            fields={data.entityType.fields}
            formValues={parsedFormValues}
            relationOptions={relationOptions}
            submitLabel="Crear registro"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function parseFieldErrors(value?: string) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string[]] =>
          typeof entry[0] === "string" &&
          Array.isArray(entry[1]) &&
          entry[1].every((item) => typeof item === "string"),
      ),
    );
  } catch {
    return {};
  }
}

function parseFormValues(value?: string) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string[]] =>
          typeof entry[0] === "string" &&
          Array.isArray(entry[1]) &&
          entry[1].every((item) => typeof item === "string"),
      ),
    );
  } catch {
    return {};
  }
}
