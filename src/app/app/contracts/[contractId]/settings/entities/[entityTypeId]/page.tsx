import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  getAuthorizedEntityType,
  getContractEntityTypes,
  keyify,
} from "@/lib/entity-config";
import {
  configurableValidationMatrix,
  parseFieldConfig,
  primaryFieldTypes,
  type ParsedFieldConfig,
} from "@/lib/field-validation";
import { getRelationConfig } from "@/lib/entity-records";

import {
  createEntityFieldAction,
  createFieldOptionAction,
  reorderEntityFieldAction,
  toggleEntityFieldAction,
  toggleFieldOptionAction,
  updateEntityFieldAction,
  updateEntityTypeAction,
  updateFieldOptionAction,
} from "../actions";
import { EntityTypeForm } from "../entity-type-form";
import { FormError } from "../form-error";

const fieldTypes = [
  "TEXT",
  "TEXTAREA",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTISELECT",
  "EMAIL",
  "PHONE",
  "URL",
  "FILE",
  "IMAGE",
  "RELATION",
] as const;

const optionTypes = new Set(["SELECT", "MULTISELECT"]);
const multipleTypes = new Set(["MULTISELECT", "FILE", "IMAGE", "RELATION"]);

function FieldControls({
  defaultValues,
  entityTypes,
}: {
  defaultValues?: {
    name?: string;
    key?: string;
    description?: string | null;
    type?: (typeof fieldTypes)[number];
    required?: boolean;
    isUnique?: boolean;
    searchable?: boolean;
    multiple?: boolean;
    isActive?: boolean;
    config?: unknown;
    options?: Array<{ label: string; value: string; isActive: boolean }>;
  };
  entityTypes: Array<{ id: string; name: string }>;
}) {
  const relationConfig = getRelationConfig(defaultValues?.config);
  const fieldType = defaultValues?.type ?? "TEXT";
  const fieldConfig = parseFieldConfig(defaultValues?.config);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Nombre
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
            defaultValue={defaultValues?.name ?? ""}
            name="name"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Key
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
            defaultValue={defaultValues?.key ?? keyify(defaultValues?.name ?? "")}
            name="key"
            required
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Descripción
        <textarea
          className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
          defaultValue={defaultValues?.description ?? ""}
          name="description"
        />
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">
          Tipo
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={defaultValues?.type ?? "TEXT"}
            name="type"
          >
            {fieldTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Entidad relacionada
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={relationConfig.targetEntityTypeId ?? ""}
            name="targetEntityTypeId"
          >
            <option value="">Solo para RELATION</option>
            {entityTypes.map((entityType) => (
              <option key={entityType.id} value={entityType.id}>
                {entityType.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Tipo de relación
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={relationConfig.relationKind ?? "ONE"}
            name="relationKind"
          >
            <option value="ONE">ONE</option>
            <option value="MANY">MANY</option>
          </select>
        </label>
      </div>

      <div className="grid gap-2 text-sm md:grid-cols-5">
        <label className="flex items-center gap-2">
          <input
            className="h-4 w-4"
            defaultChecked={defaultValues?.required ?? false}
            name="required"
            type="checkbox"
          />
          Required
        </label>
        <label className="flex items-center gap-2">
          <input
            className="h-4 w-4"
            defaultChecked={defaultValues?.isUnique ?? false}
            name="isUnique"
            type="checkbox"
          />
          Unique
        </label>
        <label className="flex items-center gap-2">
          <input
            className="h-4 w-4"
            defaultChecked={defaultValues?.searchable ?? false}
            name="searchable"
            type="checkbox"
          />
          Searchable
        </label>
        <label className="flex items-center gap-2">
          <input
            className="h-4 w-4"
            defaultChecked={defaultValues?.multiple ?? false}
            name="multiple"
            type="checkbox"
          />
          Multiple
        </label>
        <label className="flex items-center gap-2">
          <input
            className="h-4 w-4"
            defaultChecked={defaultValues?.isActive ?? true}
            name="isActive"
            type="checkbox"
          />
          Activo
        </label>
      </div>
      <FieldDisplayControls config={fieldConfig} type={fieldType} />
      <FieldValidationControls
        config={fieldConfig}
        options={defaultValues?.options ?? []}
        type={fieldType}
      />
      <p className="text-xs text-muted-foreground">
        Multiple solo es válido para {Array.from(multipleTypes).join(", ")}.
      </p>
    </div>
  );
}

function FieldDisplayControls({
  config,
  type,
}: {
  config: ParsedFieldConfig;
  type: (typeof fieldTypes)[number];
}) {
  const supportsPrimary = primaryFieldTypes.has(type);
  const showInList = config.display.showInList ?? false;

  return (
    <div className="grid gap-3 rounded-md border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">Presentación</h3>
        <p className="text-xs text-muted-foreground">
          Controla cómo este campo participa en listados y en la identidad visible del registro.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {supportsPrimary ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              className="h-4 w-4"
              defaultChecked={config.display.primary ?? false}
              name="displayPrimary"
              type="checkbox"
            />
            Campo principal
          </label>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
          <input
            className="h-4 w-4"
            defaultChecked={(config.display.primary ?? false) || showInList}
            name="displayShowInList"
            type="checkbox"
          />
          Mostrar en listado
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Orden en listado
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={config.display.listOrder ?? ""}
            min={0}
            name="displayListOrder"
            placeholder="Usa el orden del campo"
            type="number"
          />
        </label>
      </div>

      {supportsPrimary ? (
        <p className="text-xs text-muted-foreground">
          El campo principal identifica el registro en listados, relaciones y actividad.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Este tipo puede mostrarse como columna, pero no puede identificar el registro.
        </p>
      )}
    </div>
  );
}

function FieldValidationControls({
  config,
  options,
  type,
}: {
  config: ParsedFieldConfig;
  options: Array<{ label: string; value: string; isActive: boolean }>;
  type: (typeof fieldTypes)[number];
}) {
  const supported = new Set(configurableValidationMatrix[type]);
  const defaultValue = config.defaultValue;

  return (
    <div className="grid gap-3 rounded-md border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">Validaciones</h3>
        <p className="text-xs text-muted-foreground">
          Se aplican siempre en el servidor al crear o editar registros.
        </p>
      </div>

      {supported.has("required") ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            className="h-4 w-4"
            defaultChecked={config.validation.required ?? false}
            name="validationRequired"
            type="checkbox"
          />
          Obligatorio
          <span className="text-xs text-muted-foreground">
            Rechaza valores vacíos; false y 0 son válidos.
          </span>
        </label>
      ) : null}

      {supported.has("minLength") || supported.has("maxLength") ? (
        <div className="grid gap-3 md:grid-cols-2">
          {supported.has("minLength") ? (
            <label className="grid gap-2 text-sm font-medium">
              Longitud mínima
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={config.validation.minLength ?? ""}
                min={0}
                name="validationMinLength"
                type="number"
              />
            </label>
          ) : null}
          {supported.has("maxLength") ? (
            <label className="grid gap-2 text-sm font-medium">
              Longitud máxima
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={config.validation.maxLength ?? ""}
                min={0}
                name="validationMaxLength"
                type="number"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {supported.has("minimum") || supported.has("maximum") ? (
        <div className="grid gap-3 md:grid-cols-2">
          {supported.has("minimum") ? (
            <label className="grid gap-2 text-sm font-medium">
              Valor mínimo
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={config.validation.minimum ?? ""}
                name="validationMinimum"
                step="any"
                type="number"
              />
            </label>
          ) : null}
          {supported.has("maximum") ? (
            <label className="grid gap-2 text-sm font-medium">
              Valor máximo
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={config.validation.maximum ?? ""}
                name="validationMaximum"
                step="any"
                type="number"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {supported.has("regex") ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Patrón
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={config.validation.regex?.pattern ?? ""}
              name="validationRegexPattern"
              placeholder="^[A-Z0-9-]+$"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Mensaje del patrón
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={config.validation.regex?.message ?? ""}
              name="validationRegexMessage"
              placeholder="Use solo mayúsculas, números y guiones"
            />
          </label>
        </div>
      ) : null}

      {supported.has("defaultValue") ? (
        <DefaultValueControl
          defaultValue={defaultValue}
          options={options.filter((option) => option.isActive)}
          type={type}
        />
      ) : null}
    </div>
  );
}

function DefaultValueControl({
  defaultValue,
  options,
  type,
}: {
  defaultValue?: unknown;
  options: Array<{ label: string; value: string }>;
  type: (typeof fieldTypes)[number];
}) {
  if (type === "BOOLEAN") {
    return (
      <label className="grid gap-2 text-sm font-medium">
        Valor predeterminado
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={typeof defaultValue === "boolean" ? String(defaultValue) : ""}
          name="validationDefaultValue"
        >
          <option value="">Sin valor</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </label>
    );
  }

  if (type === "SELECT") {
    return (
      <label className="grid gap-2 text-sm font-medium">
        Valor predeterminado
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={typeof defaultValue === "string" ? defaultValue : ""}
          name="validationDefaultValue"
        >
          <option value="">Sin valor</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (type === "MULTISELECT") {
    const selected = new Set(Array.isArray(defaultValue) ? defaultValue.map(String) : []);

    return (
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Valores predeterminados</legend>
        <div className="grid gap-2 rounded-md border border-border p-3">
          {options.length > 0 ? (
            options.map((option) => (
              <label className="flex items-center gap-2 text-sm" key={option.value}>
                <input
                  className="h-4 w-4"
                  defaultChecked={selected.has(option.value)}
                  name="validationDefaultValue"
                  type="checkbox"
                  value={option.value}
                />
                {option.label}
              </label>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              Crea opciones activas antes de configurar valores predeterminados.
            </span>
          )}
        </div>
      </fieldset>
    );
  }

  return (
    <label className="grid gap-2 text-sm font-medium">
      Valor predeterminado
      <input
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        defaultValue={formatDefaultValue(defaultValue, type)}
        name="validationDefaultValue"
        step={type === "INTEGER" ? "1" : "any"}
        type={type === "DATE" ? "date" : type === "DATETIME" ? "datetime-local" : type === "INTEGER" || type === "DECIMAL" || type === "MONEY" ? "number" : "text"}
      />
      <span className="text-xs text-muted-foreground">
        Solo se aplica al crear registros cuando el campo queda vacío.
      </span>
    </label>
  );
}

function formatDefaultValue(value: unknown, type: (typeof fieldTypes)[number]) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  if ((type === "DATE" || type === "DATETIME") && typeof value === "string") {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return type === "DATETIME"
      ? date.toISOString().slice(0, 16)
      : date.toISOString().slice(0, 10);
  }

  return String(value);
}

export default async function EntityTypeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string; entityTypeId: string }>;
  searchParams: Promise<{ error?: string }>;
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
  const { error } = await searchParams;

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

      <Card>
        <CardHeader>
          <CardTitle>Crear campo</CardTitle>
          <CardDescription>
            Define campos para este tipo de entidad. No se crean registros todavía.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={createEntityFieldAction.bind(null, contractId, entityType.id)}
            className="grid gap-4"
          >
            <FieldControls entityTypes={entityTypeOptions} />
            <Button type="submit">Crear campo</Button>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4">
        {entityType.fields.length > 0 ? (
          entityType.fields.map((field, index) => (
            <Card className={field.isActive ? "" : "opacity-70"} key={field.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{field.name}</CardTitle>
                    <CardDescription>
                      {field.key} · {field.type} ·{" "}
                      {field.isActive ? "Activo" : "Inactivo"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <form
                      action={reorderEntityFieldAction.bind(
                        null,
                        contractId,
                        entityType.id,
                        field.id,
                        "up",
                      )}
                    >
                      <Button
                        disabled={index === 0}
                        size="sm"
                        type="submit"
                        variant="outline"
                      >
                        Subir
                      </Button>
                    </form>
                    <form
                      action={reorderEntityFieldAction.bind(
                        null,
                        contractId,
                        entityType.id,
                        field.id,
                        "down",
                      )}
                    >
                      <Button
                        disabled={index === entityType.fields.length - 1}
                        size="sm"
                        type="submit"
                        variant="outline"
                      >
                        Bajar
                      </Button>
                    </form>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                <form
                  action={updateEntityFieldAction.bind(
                    null,
                    contractId,
                    entityType.id,
                    field.id,
                  )}
                  className="grid gap-4"
                >
                  <FieldControls
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
                      config: field.config,
                      options: field.options,
                    }}
                    entityTypes={entityTypeOptions}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" type="submit">
                      Guardar campo
                    </Button>
                  </div>
                </form>
                <form
                  action={toggleEntityFieldAction.bind(
                    null,
                    contractId,
                    entityType.id,
                    field.id,
                    !field.isActive,
                  )}
                >
                  <Button size="sm" type="submit" variant="ghost">
                    {field.isActive ? "Desactivar campo" : "Activar campo"}
                  </Button>
                </form>

                {optionTypes.has(field.type) ? (
                  <>
                    <Separator />
                    <div className="grid gap-3">
                      <h3 className="text-sm font-semibold">Opciones</h3>
                      <form
                        action={createFieldOptionAction.bind(
                          null,
                          contractId,
                          entityType.id,
                          field.id,
                        )}
                        className="grid gap-3 md:grid-cols-[1fr_1fr_100px_auto_auto]"
                      >
                        <input
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          name="label"
                          placeholder="Label"
                          required
                        />
                        <input
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          name="value"
                          placeholder="value"
                          required
                        />
                        <input
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          min={0}
                          name="sortOrder"
                          type="number"
                          defaultValue={field.options.length + 1}
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            className="h-4 w-4"
                            defaultChecked
                            name="isActive"
                            type="checkbox"
                          />
                          Activa
                        </label>
                        <Button type="submit">Agregar</Button>
                      </form>

                      {field.options.map((option) => (
                        <form
                          action={updateFieldOptionAction.bind(
                            null,
                            contractId,
                            entityType.id,
                            field.id,
                            option.id,
                          )}
                          className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_1fr_100px_auto_auto_auto]"
                          key={option.id}
                        >
                          <input
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            defaultValue={option.label}
                            name="label"
                            required
                          />
                          <input
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            defaultValue={option.value}
                            name="value"
                            required
                          />
                          <input
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            defaultValue={option.sortOrder}
                            min={0}
                            name="sortOrder"
                            type="number"
                          />
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              className="h-4 w-4"
                              defaultChecked={option.isActive}
                              name="isActive"
                              type="checkbox"
                            />
                            Activa
                          </label>
                          <Button type="submit" variant="outline">
                            Guardar
                          </Button>
                          <Button
                            formAction={toggleFieldOptionAction.bind(
                              null,
                              contractId,
                              entityType.id,
                              field.id,
                              option.id,
                              !option.isActive,
                            )}
                            type="submit"
                            variant="ghost"
                          >
                            {option.isActive ? "Desactivar" : "Activar"}
                          </Button>
                        </form>
                      ))}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Todavía no hay campos configurados.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
