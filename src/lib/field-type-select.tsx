import { type EntityFieldType } from "@prisma/client";
import { ChevronDown } from "lucide-react";

import {
  fieldTypeDescriptions,
  fieldTypeLabels,
  supportedEntityFieldTypes,
} from "./field-editor-state";

export function FieldTypeSelect({
  disabled,
  fieldErrors,
  onChange,
  setFirstErrorRef,
  type,
}: {
  disabled: boolean;
  fieldErrors?: string[];
  onChange: (type: EntityFieldType) => void;
  setFirstErrorRef: (element: HTMLElement | null) => void;
  type: EntityFieldType;
}) {
  const descriptionId = "field-editor-type-description";
  const lockedMessageId = "field-editor-type-locked-message";

  return (
    <div className="grid min-w-0 gap-2 text-sm font-medium">
      <label htmlFor="field-editor-type">Tipo de campo</label>
      <div className="relative min-w-0">
        <select
          aria-describedby={
            disabled ? `${descriptionId} ${lockedMessageId}` : descriptionId
          }
          className="block h-10 w-full min-w-0 appearance-none rounded-md border border-input bg-background px-3 pr-10 text-sm text-foreground shadow-sm outline-none ring-ring focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          data-field-type-select
          disabled={disabled}
          id="field-editor-type"
          name="type"
          onChange={(event) => onChange(event.target.value as EntityFieldType)}
          ref={fieldErrors ? setFirstErrorRef : undefined}
          value={type}
        >
          {supportedEntityFieldTypes.map((fieldType) => (
            <option key={fieldType} value={fieldType}>
              {fieldTypeLabels[fieldType]}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      {disabled ? <input name="type" type="hidden" value={type} /> : null}
      <span className="text-xs text-muted-foreground" id={descriptionId}>
        {fieldTypeDescriptions[type]}
      </span>
      {disabled ? (
        <span className="text-xs text-muted-foreground" id={lockedMessageId}>
          No puedes cambiar el tipo porque este campo ya contiene información.
        </span>
      ) : null}
    </div>
  );
}
