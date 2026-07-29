import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  auditActionLabels,
  formatAuditValue,
  getRecordAuditHistory,
} from "@/lib/audit";
import {
  getAuthorizedEntityRecord,
  getIncomingRecordRelations,
  getRecordRelations,
  getRelationOptions,
  recordStatusLabels,
} from "@/lib/entity-records";

import { updateEntityRecordAction } from "../../actions";
import { RecordForm } from "../../record-form";

export default async function EntityRecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string; entityTypeId: string; recordId: string }>;
  searchParams: Promise<{ error?: string; fieldErrors?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId, entityTypeId, recordId } = await params;
  const data = await getAuthorizedEntityRecord(
    contractId,
    entityTypeId,
    recordId,
    session.user.id,
  );
  const relationOptions = await getRelationOptions(
    contractId,
    entityTypeId,
    session.user.id,
  );
  const outgoingRelations = await getRecordRelations(
    contractId,
    entityTypeId,
    recordId,
    session.user.id,
  );
  const incomingRelations = await getIncomingRecordRelations(
    contractId,
    entityTypeId,
    recordId,
    session.user.id,
  );
  const auditHistory = await getRecordAuditHistory(
    contractId,
    entityTypeId,
    recordId,
    session.user.id,
    1,
  );

  if (
    !data ||
    !relationOptions ||
    !outgoingRelations ||
    !incomingRelations ||
    !auditHistory
  ) {
    notFound();
  }

  const { error, fieldErrors } = await searchParams;
  const parsedFieldErrors = parseFieldErrors(fieldErrors);

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{data.record.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            Editar registro de {data.entityType.name}.
          </p>
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
            action={updateEntityRecordAction.bind(
              null,
              contractId,
              entityTypeId,
              recordId,
            )}
            fieldErrors={parsedFieldErrors}
            fields={data.entityType.fields}
            relationOptions={relationOptions}
            relations={data.record.outgoingRelations}
            status={data.record.status}
            submitLabel="Guardar registro"
            values={data.record.values}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Relaciones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {outgoingRelations.length > 0 ? (
            outgoingRelations.map((relation) => (
              <div className="grid gap-1 text-sm" key={relation.id}>
                <div className="font-medium">{relation.sourceField.name}</div>
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={`/app/contracts/${contractId}/records/${relation.targetRecord.entityTypeId}/${relation.targetRecord.id}`}
                >
                  {relation.targetRecord.displayName} ·{" "}
                  {relation.targetRecord.entityType.name}
                  {relation.targetRecord.status !== "ACTIVE"
                    ? ` · ${recordStatusLabels[relation.targetRecord.status]}`
                    : ""}
                </Link>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Este registro no tiene relaciones salientes.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Relacionado desde</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {incomingRelations.length > 0 ? (
            incomingRelations.map((relation) => (
              <div className="grid gap-1 text-sm" key={relation.id}>
                <div className="text-muted-foreground">
                  Mediante campo {relation.sourceField.name}
                </div>
                <Link
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href={`/app/contracts/${contractId}/records/${relation.sourceRecord.entityTypeId}/${relation.sourceRecord.id}`}
                >
                  {relation.sourceRecord.entityType.name}{" "}
                  {relation.sourceRecord.displayName}
                </Link>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay registros apuntando hacia este registro.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          {auditHistory.events.length > 0 ? (
            auditHistory.events.map((event) => (
              <div className="grid gap-2 border-b border-border pb-4 last:border-0 last:pb-0" key={event.id}>
                <div className="grid gap-1 text-sm">
                  <div className="font-medium">
                    {event.actorUser?.name ?? event.actorUser?.email ?? "Sistema"}
                  </div>
                  <div className="text-muted-foreground">
                    {event.createdAt.toLocaleString("es-CL")} ·{" "}
                    {auditActionLabels[event.action]}
                  </div>
                  <div>{event.summary}</div>
                </div>
                {event.changes.length > 0 ? (
                  <ul className="grid gap-1 text-sm text-muted-foreground">
                    {event.changes.map((change) => (
                      <li key={change.id}>
                        {change.fieldName}: {formatAuditValue(change.oldValue)} →{" "}
                        {formatAuditValue(change.newValue)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Este registro todavía no tiene eventos de auditoría.
            </p>
          )}
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
