import { type EntityFieldType, type Prisma } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { dateOnlyInputValue } from "@/lib/date-only";
import { parseFieldConfig } from "@/lib/field-validation";
import { getExistingFormValue, getRelationConfig } from "@/lib/entity-records";
import { getMoneyConfig } from "@/lib/money";

type Field = {
  id: string;
  name: string;
  description: string | null;
  type: EntityFieldType;
  required: boolean;
  config?: Prisma.JsonValue | null;
  options: Array<{
    label: string;
    value: string;
    isActive: boolean;
  }>;
};

type ExistingValue = {
  entityFieldId: string;
  textValue: string | null;
  integerValue: number | null;
  decimalValue: Prisma.Decimal | null;
  booleanValue: boolean | null;
  dateValue: Date | null;
  jsonValue: Prisma.JsonValue | null;
};

type RelationOption = {
  id: string;
  displayName: string;
  entityTypeName: string;
};

type ExistingRelation = {
  sourceFieldId: string;
  targetRecordId: string;
};

const unavailableTypes = new Set<EntityFieldType>(["FILE", "IMAGE"]);

export function RecordForm({
  action,
  formValues = {},
  fields,
  values = [],
  submitLabel,
  relationOptions = {},
  relations = [],
  fieldErrors = {},
}: {
  action: (formData: FormData) => void | Promise<void>;
  formValues?: Record<string, string[]>;
  fields: Field[];
  values?: ExistingValue[];
  submitLabel: string;
  relationOptions?: Record<string, RelationOption[]>;
  relations?: ExistingRelation[];
  fieldErrors?: Record<string, string[]>;
}) {
  return (
    <form action={action} className="grid gap-5">
      {fields.length > 0 ? (
        fields.map((field) => (
          <DynamicField
            field={field}
            key={field.id}
            relationOptions={relationOptions[field.id] ?? []}
            relations={relations}
            errors={fieldErrors[field.id] ?? []}
            submittedValues={formValues[field.id]}
            value={getExistingFormValue(field.id, values)}
          />
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          Este tipo de entidad no tiene campos activos configurados.
        </p>
      )}

      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function DynamicField({
  field,
  relationOptions,
  relations,
  errors,
  submittedValues,
  value,
}: {
  field: Field;
  relationOptions: RelationOption[];
  relations: ExistingRelation[];
  errors: string[];
  submittedValues?: string[];
  value?: ExistingValue;
}) {
  const name = `field_${field.id}`;
  const label = `${field.name}${field.required ? " *" : ""}`;
  const config = parseFieldConfig(field.config);
  const defaultValue = value ? undefined : config.defaultValue;

  if (unavailableTypes.has(field.type)) {
    return (
      <label className="grid gap-2 text-sm font-medium">
        {label}
        <input
          className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
          disabled
          placeholder="Disponible en una próxima etapa"
        />
      </label>
    );
  }

  if (field.type === "RELATION") {
    const relationConfig = getRelationConfig(field.config);
    const selected = new Set(
      submittedValues ??
        relations
          .filter((relation) => relation.sourceFieldId === field.id)
          .map((relation) => relation.targetRecordId),
    );

    if (relationConfig.relationKind === "MANY") {
      return (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{label}</legend>
          <div className="grid gap-2 rounded-md border border-border p-3">
            {relationOptions.length > 0 ? (
              relationOptions.map((option) => (
                <label className="flex items-center gap-2 text-sm" key={option.id}>
                  <input
                    className="h-4 w-4"
                    defaultChecked={selected.has(option.id)}
                    name={name}
                    type="checkbox"
                    value={option.id}
                  />
                  <span>{option.displayName}</span>
                </label>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                No hay registros disponibles.
              </span>
            )}
          </div>
          <FieldDescription text={field.description} />
          <FieldErrors errors={errors} />
        </fieldset>
      );
    }

    return (
      <label className="grid gap-2 text-sm font-medium">
        {label}
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={Array.from(selected)[0] ?? ""}
          name={name}
          required={field.required}
        >
          <option value="">Seleccionar</option>
          {relationOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.displayName}
            </option>
          ))}
        </select>
        <FieldDescription text={field.description} />
        <FieldErrors errors={errors} />
      </label>
    );
  }

  if (field.type === "TEXTAREA") {
    return (
      <label className="grid gap-2 text-sm font-medium">
        {label}
        <textarea
          className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
          defaultValue={submittedValues?.[0] ?? value?.textValue ?? formatDefaultValue(defaultValue, field.type)}
          name={name}
          required={field.required}
        />
        <FieldDescription text={field.description} />
        <FieldErrors errors={errors} />
      </label>
    );
  }

  if (field.type === "BOOLEAN") {
    const submittedBoolean = submittedValues
      ? submittedValues.some((item) => item === "on" || item === "true" || item === "1")
      : undefined;

    return (
      <label className="flex items-center gap-2 text-sm font-medium">
        <input name={name} type="hidden" value="false" />
        <input
          className="h-4 w-4"
          defaultChecked={submittedBoolean ?? (value?.booleanValue ?? defaultValue === true)}
          name={name}
          type="checkbox"
        />
        {label}
        <FieldErrors errors={errors} />
      </label>
    );
  }

  if (field.type === "SELECT") {
    const selectedValue = submittedValues?.[0] ?? value?.textValue ?? formatDefaultValue(defaultValue, field.type);
    const visibleOptions = field.options.filter(
      (option) => option.isActive || option.value === selectedValue,
    );

    return (
      <label className="grid gap-2 text-sm font-medium">
        {label}
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={selectedValue}
          name={name}
          required={field.required}
        >
          <option value="">Seleccionar</option>
          {visibleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldDescription text={field.description} />
        <FieldErrors errors={errors} />
      </label>
    );
  }

  if (field.type === "MULTISELECT") {
    const selected = new Set(
      submittedValues ??
      (Array.isArray(value?.jsonValue)
        ? value.jsonValue.map(String)
        : Array.isArray(defaultValue)
          ? defaultValue.map(String)
          : []),
    );
    const visibleOptions = field.options.filter(
      (option) => option.isActive || selected.has(option.value),
    );

    return (
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{label}</legend>
        <div className="grid gap-2 rounded-md border border-border p-3">
          {visibleOptions.map((option) => (
            <label className="flex items-center gap-2 text-sm" key={option.value}>
              <input
                className="h-4 w-4"
                defaultChecked={selected.has(option.value)}
                name={name}
                type="checkbox"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
        <FieldDescription text={field.description} />
        <FieldErrors errors={errors} />
      </fieldset>
    );
  }

  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
        defaultValue={submittedValues?.[0] ?? getInputValue(field.type, value, defaultValue)}
        name={name}
        required={field.required}
        step={field.type === "INTEGER" ? "1" : "any"}
        type={getInputType(field.type)}
      />
      {field.type === "MONEY" ? (
        <span className="text-xs text-muted-foreground">
          {getMoneyConfig(field.config).currency}
        </span>
      ) : null}
      <FieldDescription text={field.description} />
      <FieldErrors errors={errors} />
    </label>
  );
}

function FieldDescription({ text }: { text?: string | null }) {
  return text ? <span className="text-xs text-muted-foreground">{text}</span> : null;
}

function FieldErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <span className="grid gap-1 text-xs text-destructive">
      {errors.map((error) => (
        <span key={error}>{error}</span>
      ))}
    </span>
  );
}

function getInputType(type: EntityFieldType) {
  if (type === "INTEGER" || type === "DECIMAL" || type === "MONEY") {
    return "number";
  }

  if (type === "DATE") {
    return "date";
  }

  if (type === "DATETIME") {
    return "datetime-local";
  }

  if (type === "TIME") {
    return "time";
  }

  if (type === "EMAIL") {
    return "email";
  }

  if (type === "URL") {
    return "url";
  }

  return "text";
}

function getInputValue(
  type: EntityFieldType,
  value?: ExistingValue,
  defaultValue?: unknown,
) {
  if (!value) {
    return formatDefaultValue(defaultValue, type);
  }

  if (value.textValue) {
    return value.textValue;
  }

  if (value.integerValue !== null) {
    return String(value.integerValue);
  }

  if (value.decimalValue !== null) {
    return value.decimalValue.toString();
  }

  if (value.dateValue) {
    if (type === "DATETIME") {
      return value.dateValue.toISOString().slice(0, 16);
    }

    return dateOnlyInputValue(value.dateValue);
  }

  return "";
}

function formatDefaultValue(value: unknown, type: EntityFieldType) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  if (type === "DATE" && typeof value === "string") {
    return dateOnlyInputValue(value);
  }

  if (type === "DATETIME" && typeof value === "string") {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toISOString().slice(0, 16);
  }

  return String(value);
}
