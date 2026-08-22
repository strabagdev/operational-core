import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

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
  deserializeEntityValue,
  getAuthorizedEntityRecord,
  getIncomingRecordRelationGroups,
  getRelationOptions,
  type IncomingRecordRelationGroup,
} from "@/lib/entity-records";
import {
  entityRecordCancelEditPath,
  entityRecordEditPath,
} from "@/lib/entity-record-routes";

import { updateEntityRecordAction } from "../../actions";
import { RecordForm } from "../../record-form";

export default async function EntityRecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string; entityTypeId: string; recordId: string }>;
  searchParams: Promise<{
    edit?: string;
    error?: string;
    fieldErrors?: string;
    formValues?: string;
    notice?: string;
  }>;
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
  const incomingRelationGroups = await getIncomingRecordRelationGroups(
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
    !incomingRelationGroups ||
    !auditHistory
  ) {
    notFound();
  }

  const { edit, error, fieldErrors, formValues, notice } = await searchParams;
  const parsedFieldErrors = parseFieldErrors(fieldErrors);
  const parsedFormValues = parseFormValues(formValues);
  const isEditing = edit === "1" || Boolean(error) || Object.keys(parsedFieldErrors).length > 0;

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{data.record.displayName}</h1>
          <p className="text-sm text-muted-foreground">{data.entityType.name}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/contracts/${contractId}/records/${entityTypeId}`}>
              Volver
            </Link>
          </Button>
          {isEditing ? (
            <Button asChild variant="outline">
              <Link href={entityRecordCancelEditPath(contractId, entityTypeId, recordId)}>
                Cancelar edición
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href={entityRecordEditPath(contractId, entityTypeId, recordId)}>
                Editar
              </Link>
            </Button>
          )}
        </div>
      </header>

      {notice && !isEditing ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{notice}</p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <dt className="text-sm font-medium">Creado</dt>
              <dd className="text-sm text-muted-foreground">
                {data.record.createdAt.toLocaleString("es-CL")}
              </dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm font-medium">Actualizado</dt>
              <dd className="text-sm text-muted-foreground">
                {data.record.updatedAt.toLocaleString("es-CL")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos del registro</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <RecordForm
              action={updateEntityRecordAction.bind(
                null,
                contractId,
                entityTypeId,
                recordId,
              )}
              fieldErrors={parsedFieldErrors}
              fields={data.entityType.fields}
              formValues={parsedFormValues}
              relationOptions={relationOptions}
              relations={data.record.outgoingRelations}
              submitLabel="Guardar cambios"
              values={data.record.values}
            />
          ) : (
            <RecordReadView
              contractId={contractId}
              fields={data.entityType.fields}
              relations={data.record.outgoingRelations}
              values={data.record.values}
            />
          )}
        </CardContent>
      </Card>

      {incomingRelationGroups.length > 0 ? (
        <IncomingRelationsSummary
          contractId={contractId}
          entityTypeId={entityTypeId}
          groups={incomingRelationGroups}
          recordId={recordId}
        />
      ) : null}

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

function IncomingRelationsSummary({
  contractId,
  entityTypeId,
  groups,
  recordId,
}: {
  contractId: string;
  entityTypeId: string;
  groups: IncomingRecordRelationGroup[];
  recordId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Relacionado desde</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {groups.map((group) => (
          <section
            className="grid gap-2 rounded-md border border-border p-3"
            key={`${group.sourceEntityTypeId}:${group.sourceFieldId}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid gap-0.5">
                <h3 className="text-sm font-medium">{group.sourceEntityTypeName}</h3>
                <p className="text-xs text-muted-foreground">{group.sourceFieldName}</p>
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {formatRelatedCount(group.total)}
              </p>
            </div>
            <div className="grid gap-1 text-sm">
              {group.preview.map((record) => (
                <Link
                  className="w-fit text-primary underline-offset-4 hover:underline"
                  href={`/app/contracts/${contractId}/records/${group.sourceEntityTypeId}/${record.recordId}`}
                  key={record.recordId}
                >
                  {record.displayName}
                </Link>
              ))}
            </div>
            <Link
              className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
              href={incomingRelationsHref({
                contractId,
                entityTypeId,
                recordId,
                sourceEntityTypeId: group.sourceEntityTypeId,
                sourceFieldId: group.sourceFieldId,
              })}
            >
              Ver todos ({group.total})
            </Link>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function RecordReadView({
  contractId,
  fields,
  relations,
  values,
}: {
  contractId: string;
  fields: Array<{
    id: string;
    name: string;
    type: string;
    config: Prisma.JsonValue | null;
    options: Array<{ label: string; value: string }>;
  }>;
  values: Array<{
    entityFieldId: string;
    textValue: string | null;
    integerValue: number | null;
    decimalValue: Prisma.Decimal | null;
    booleanValue: boolean | null;
    dateValue: Date | null;
    jsonValue: Prisma.JsonValue | null;
  }>;
  relations: Array<{
    sourceFieldId: string;
    targetRecordId?: string | null;
    targetRecord: {
      displayName: string;
      entityTypeId?: string | null;
      id?: string | null;
    };
  }>;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este tipo de entidad no tiene campos activos configurados.
      </p>
    );
  }

  return (
    <dl className="grid gap-4">
      {fields.map((field) => {
        const value = values.find((item) => item.entityFieldId === field.id);
        const fieldRelations = relations.filter(
          (relation) => relation.sourceFieldId === field.id,
        );
        const displayValue = value
          ? deserializeEntityValue({
              ...value,
              jsonValue: value.jsonValue,
              entityField: {
                type: field.type,
                config: field.config,
                options: field.options,
              },
            })
          : "";

        return (
          <div className="grid gap-1" key={field.id}>
            <dt className="text-sm font-medium">{field.name}</dt>
            <dd className="text-sm text-muted-foreground">
              {field.type === "RELATION" ? (
                <RelationReadValue
                  contractId={contractId}
                  relations={fieldRelations}
                />
              ) : (
                displayValue || "Sin valor"
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function RelationReadValue({
  contractId,
  relations,
}: {
  contractId: string;
  relations: Array<{
    targetRecordId?: string | null;
    targetRecord: {
      displayName: string;
      entityTypeId?: string | null;
      id?: string | null;
    };
  }>;
}) {
  if (relations.length === 0) {
    return "Sin valor";
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-1">
      {relations.map((relation, index) => {
        const targetRecordId = relation.targetRecord.id ?? relation.targetRecordId;
        const targetEntityTypeId = relation.targetRecord.entityTypeId;
        const content = targetRecordId && targetEntityTypeId ? (
          <Link
            className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/app/contracts/${contractId}/records/${targetEntityTypeId}/${targetRecordId}`}
          >
            {relation.targetRecord.displayName}
          </Link>
        ) : (
          <span>{relation.targetRecord.displayName || "Registro relacionado no disponible"}</span>
        );

        return (
          <span className="inline-flex items-center gap-x-1" key={`${targetRecordId ?? "missing"}-${index}`}>
            {index > 0 ? <span aria-hidden="true">·</span> : null}
            {content}
          </span>
        );
      })}
    </span>
  );
}

function formatRelatedCount(total: number) {
  return total === 1 ? "1 registro relacionado" : `${total} registros relacionados`;
}

function incomingRelationsHref({
  contractId,
  entityTypeId,
  recordId,
  sourceEntityTypeId,
  sourceFieldId,
}: {
  contractId: string;
  entityTypeId: string;
  recordId: string;
  sourceEntityTypeId: string;
  sourceFieldId: string;
}) {
  const params = new URLSearchParams({
    sourceEntityTypeId,
    sourceFieldId,
  });

  return `/app/contracts/${contractId}/records/${entityTypeId}/${recordId}/relations?${params.toString()}`;
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
