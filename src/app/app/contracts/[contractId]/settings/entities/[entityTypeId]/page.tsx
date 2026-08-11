import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { type EntityFieldType } from "@prisma/client";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAuthorizedEntityType,
  getContractEntityTypes,
  getFieldOptionUsage,
} from "@/lib/entity-config";
import { parseFieldConfig } from "@/lib/field-validation";
import {
  buildFieldEditorHref,
  getFieldEditorMode,
  type FieldEditorMode,
} from "@/lib/field-editor-navigation";
import { supportedEntityFieldTypes } from "@/lib/field-editor-state";
import { getFieldEditorSummary } from "@/lib/field-editor-ux";
import {
  filterFieldList,
  getFieldTypeLabel,
  type FieldUseFilter,
} from "@/lib/field-list-ux";

import {
  createEntityFieldEditorAction,
  deleteFieldOptionAction,
  reorderEntityFieldAction,
  toggleEntityFieldFromListAction,
  updateEntityFieldEditorAction,
  updateEntityTypeAction,
} from "../actions";
import { EntityTypeForm } from "../entity-type-form";
import { FormError } from "../form-error";
import { FieldEditorFormSheet } from "./field-editor-form";
import { FieldListItem, type FieldWithUsage } from "./field-list-item";

export default async function EntityTypeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string; entityTypeId: string }>;
  searchParams: Promise<{
    error?: string;
    fieldQ?: string;
    fieldType?: string;
    fieldState?: string;
    fieldUse?: string;
    createField?: string;
    editField?: string;
    notice?: string;
  }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId, entityTypeId } = await params;
  const data = await getAuthorizedEntityType(
    contractId,
    entityTypeId,
    session.user.id,
  );
  const contractData = await getContractEntityTypes(contractId, session.user.id);

  if (!data || !contractData) {
    notFound();
  }

  const { entityType } = data;
  const entityTypeOptions = contractData.entityTypes.map((item) => ({
    id: item.id,
    name: item.name,
  }));
  const { error, fieldQ, fieldType, fieldState, fieldUse, createField, editField, notice } =
    await searchParams;
  const basePath = `/app/contracts/${contractId}/settings/entities/${entityType.id}`;
  const currentParams = {
    fieldQ,
    fieldType,
    fieldState,
    fieldUse,
    createField,
    editField,
    notice,
  };
  const editorMode = getFieldEditorMode({ createField, editField });
  const closeEditorHref = buildFieldEditorHref({
    basePath,
    currentParams,
    mode: { kind: "closed" },
  });
  const createEditorHref = buildFieldEditorHref({
    basePath,
    currentParams,
    mode: { kind: "create" },
  });
  const fieldFilters: {
    query?: string;
    type: EntityFieldType | "ALL";
    state: "ACTIVE" | "INACTIVE" | "ALL";
    use: FieldUseFilter;
  } = {
    query: fieldQ,
    type: parseFieldTypeFilter(fieldType),
    state: parseFieldStateFilter(fieldState),
    use: parseFieldUseFilter(fieldUse),
  };
  const visibleFields = filterFieldList({
    fields: entityType.fields,
    ...fieldFilters,
  });

  return (
    <div className="grid max-w-5xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{entityType.name}</h1>
          <p className="text-sm text-muted-foreground">
            Configuración de tipo de entidad y campos dinámicos.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/contracts/${contractId}/settings/entities`}>
            Volver
          </Link>
        </Button>
      </header>

      <FormError message={error} />
      {notice ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{notice}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos del tipo</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityTypeForm
            action={updateEntityTypeAction.bind(null, contractId, entityType.id)}
            initialValues={entityType}
            submitLabel="Guardar tipo"
          />
        </CardContent>
      </Card>

      <section className="grid gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Campos</h2>
            <p className="text-sm text-muted-foreground">
              {entityType.fields.length} campo{entityType.fields.length === 1 ? "" : "s"} configurado{entityType.fields.length === 1 ? "" : "s"}.
            </p>
            <p className="text-sm text-muted-foreground">
              El orden de los campos se utiliza en formularios, listados y plantillas Excel.
            </p>
          </div>
          <Button asChild>
            <Link href={createEditorHref}>Agregar campo</Link>
          </Button>
        </div>

        {entityType.fields.length > 0 ? (
          <>
            <FieldFilters
              contractId={contractId}
              entityTypeId={entityType.id}
              filters={fieldFilters}
            />
            <div className="grid gap-3" aria-live="polite">
              {visibleFields.length > 0 ? (
                visibleFields.map((field) => {
                  const originalIndex = entityType.fields.findIndex((item) => item.id === field.id);

                  return (
                    <FieldListItem
                      contractId={contractId}
                      entityTypeId={entityType.id}
                      entityTypes={entityTypeOptions}
                      field={field}
                      index={originalIndex}
                      isLast={originalIndex === entityType.fields.length - 1}
                      key={field.id}
                      openHref={buildFieldEditorHref({
                        basePath,
                        currentParams,
                        mode: { kind: "edit", fieldId: field.id },
                      })}
                      reorderAction={reorderEntityFieldAction}
                      returnTo={closeEditorHref}
                      toggleAction={toggleEntityFieldFromListAction}
                    />
                  );
                })
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium">No hay campos para estos filtros.</p>
                    <p className="text-sm text-muted-foreground">
                      Ajusta la búsqueda o cambia los filtros para ver más campos.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        ) : (
          <EmptyFieldState />
        )}
      </section>

      <FieldEditorOverlay
        closeHref={closeEditorHref}
        contractId={contractId}
        currentParams={currentParams}
        editorMode={editorMode}
        entityName={entityType.name}
        entityTypeId={entityType.id}
        entityTypes={entityTypeOptions}
        fields={entityType.fields}
      />
    </div>
  );
}

function FieldFilters({
  contractId,
  entityTypeId,
  filters,
}: {
  contractId: string;
  entityTypeId: string;
  filters: {
    query?: string;
    type: EntityFieldType | "ALL";
    state: "ACTIVE" | "INACTIVE" | "ALL";
    use: FieldUseFilter;
  };
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <form
          action={`/app/contracts/${contractId}/settings/entities/${entityTypeId}`}
          className="grid gap-3 md:grid-cols-[1fr_180px_160px_180px_auto]"
          method="get"
        >
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
            defaultValue={filters.query ?? ""}
            name="fieldQ"
            placeholder="Buscar por nombre, identificador o descripción"
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={filters.type}
            name="fieldType"
          >
            <option value="ALL">Todos los tipos</option>
            {supportedEntityFieldTypes.map((type) => (
              <option key={type} value={type}>
                {getFieldTypeLabel(type)}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={filters.state}
            name="fieldState"
          >
            <option value="ALL">Todos los estados</option>
            <option value="ACTIVE">Activos</option>
            <option value="INACTIVE">Inactivos</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={filters.use}
            name="fieldUse"
          >
            <option value="ALL">Todos los usos</option>
            <option value="PRIMARY">Principal</option>
            <option value="LIST">En listado</option>
            <option value="SEARCH">En búsquedas</option>
            <option value="VALIDATIONS">Con validaciones</option>
            <option value="RELATION">Relación</option>
            <option value="OPTIONS">Con opciones</option>
          </select>
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

async function FieldEditorOverlay({
  closeHref,
  contractId,
  currentParams,
  editorMode,
  entityName,
  entityTypeId,
  entityTypes,
  fields,
}: {
  closeHref: string;
  contractId: string;
  currentParams: Record<string, string | undefined>;
  editorMode: FieldEditorMode;
  entityName: string;
  entityTypeId: string;
  entityTypes: Array<{ id: string; name: string }>;
  fields: FieldWithUsage[];
}) {
  if (editorMode.kind === "closed") {
    return null;
  }

  if (editorMode.kind === "create") {
    const returnTo = buildFieldEditorHref({
      basePath: `/app/contracts/${contractId}/settings/entities/${entityTypeId}`,
      currentParams,
      mode: editorMode,
    });

    return (
      <FieldEditorFormSheet
        key="create-field"
        action={createEntityFieldEditorAction.bind(null, contractId, entityTypeId)}
        closeHref={closeHref}
        description="Define la información que podrán contener los registros de esta entidad."
        entityName={entityName}
        entityTypes={entityTypes}
        fieldCount={fields.length}
        formId="create-field-form"
        hasPrimary={fields.some((field) => parseFieldConfig(field.config).display.primary)}
        mode="create"
        returnTo={returnTo}
        successTo={closeHref}
        summary="Nuevo campo"
        title="Agregar campo"
      />
    );
  }

  const field = fields.find((item) => item.id === editorMode.fieldId);

  if (!field) {
    return null;
  }

  const returnTo = buildFieldEditorHref({
    basePath: `/app/contracts/${contractId}/settings/entities/${entityTypeId}`,
    currentParams,
    mode: editorMode,
  });
  const fieldConfig = parseFieldConfig(field.config);
  const hasValues = (field._count?.values ?? 0) > 0 || (field._count?.relations ?? 0) > 0;
  const optionUsages = new Map(
    await Promise.all(
      field.options.map(async (option) => [
        option.id,
        (await getFieldOptionUsage(option.id)) ?? { isUsed: false, usageCount: 0 },
      ] as const),
    ),
  );

  return (
    <FieldEditorFormSheet
      key={`edit-field-${field.id}-${field.options.map((option) => `${option.id}:${option.value}:${option.sortOrder}:${option.isActive}`).join("|")}`}
      action={updateEntityFieldEditorAction.bind(
        null,
        contractId,
        entityTypeId,
        field.id,
      )}
      closeHref={closeHref}
      description="Actualiza cómo se comporta este campo en formularios, listados y registros."
      deleteOptionAction={deleteFieldOptionAction}
      defaultValues={{
        name: field.name,
        key: field.key,
        description: field.description,
        type: field.type,
        required: field.required,
        isUnique: field.isUnique,
        searchable: field.searchable,
        multiple: field.multiple,
        isActive: field.isActive,
        targetEntityTypeId: fieldConfig.targetEntityTypeId,
        relationKind: fieldConfig.relationKind,
        validation: fieldConfig.validation,
        defaultValue: fieldConfig.defaultValue,
        display: fieldConfig.display,
        money: fieldConfig.money,
        options: field.options.map((option) => ({
          id: option.id,
          label: option.label,
          value: option.value,
          sortOrder: option.sortOrder,
          isActive: option.isActive,
          hasValues: (optionUsages.get(option.id)?.usageCount ?? 0) > 0,
          usageCount: optionUsages.get(option.id)?.usageCount ?? 0,
        })),
        hasValues,
      }}
      entityName={entityName}
      entityTypes={entityTypes}
      fieldCount={fields.length}
      formId="edit-field-form"
      hasPrimary={fields.some((item) => parseFieldConfig(item.config).display.primary)}
      mode="edit"
      optionActionContext={{ contractId, entityTypeId, fieldId: field.id }}
      returnTo={returnTo}
      successTo={closeHref}
      summary={`${field.name} · ${getFieldEditorSummary(field)}`}
      title="Editar campo"
    />
  );
}

function EmptyFieldState() {
  return (
    <Card>
      <CardContent className="grid gap-3 pt-6">
        <h3 className="text-base font-semibold">Aún no hay campos</h3>
        <p className="text-sm text-muted-foreground">
          Agrega el primer campo para comenzar a definir la información de esta entidad.
        </p>
        <p className="text-sm text-muted-foreground">
          Usa el botón Agregar campo para crear una configuración inicial.
        </p>
      </CardContent>
    </Card>
  );
}

function parseFieldTypeFilter(value?: string): EntityFieldType | "ALL" {
  return supportedEntityFieldTypes.includes(value as EntityFieldType)
    ? (value as EntityFieldType)
    : "ALL";
}

function parseFieldStateFilter(value?: string): "ACTIVE" | "INACTIVE" | "ALL" {
  return value === "ACTIVE" || value === "INACTIVE" ? value : "ALL";
}

function parseFieldUseFilter(value?: string): FieldUseFilter {
  if (
    value === "PRIMARY" ||
    value === "LIST" ||
    value === "SEARCH" ||
    value === "VALIDATIONS" ||
    value === "RELATION" ||
    value === "OPTIONS"
  ) {
    return value;
  }

  return "ALL";
}
