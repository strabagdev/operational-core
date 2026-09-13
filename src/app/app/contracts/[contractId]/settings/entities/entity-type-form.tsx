"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { EntityNature } from "@prisma/client";

import {
  IconPicker,
  getIconPickerFormValue,
  getIconPickerLabel,
  getIconPickerOptions,
} from "@/components/icon-picker";
import { Button } from "@/components/ui/button";
import { entityNatureOptions, getEntityNatureOption } from "@/lib/entity-nature";
import { slugify } from "@/lib/format";

type EntityTypeFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initialValues?: {
    name: string;
    slug: string;
    description?: string | null;
    icon?: string | null;
    nature?: EntityNature | null;
    isActive: boolean;
  };
};

export type EntityTypeFormSnapshot = {
  description: string;
  icon: string;
  isActive: boolean;
  name: string;
  nature: EntityNature;
  slug: string;
};

export function getInitialEntityTypeFormSnapshot(
  initialValues: EntityTypeFormProps["initialValues"],
): EntityTypeFormSnapshot {
  return {
    description: initialValues?.description ?? "",
    icon: initialValues?.icon ?? "",
    isActive: initialValues?.isActive ?? true,
    name: initialValues?.name ?? "",
    nature: initialValues?.nature ?? "MASTER",
    slug: initialValues?.slug ?? "",
  };
}

export function isEntityTypeFormDirty(
  current: EntityTypeFormSnapshot,
  initial: EntityTypeFormSnapshot,
) {
  return (
    current.description !== initial.description ||
    current.icon !== initial.icon ||
    current.isActive !== initial.isActive ||
    current.name !== initial.name ||
    current.nature !== initial.nature ||
    current.slug !== initial.slug
  );
}

export function EntityTypeForm({
  action,
  submitLabel,
  initialValues,
}: EntityTypeFormProps) {
  const initialSnapshot = getInitialEntityTypeFormSnapshot(initialValues);
  const [name, setName] = useState(initialSnapshot.name);
  const [slug, setSlug] = useState(initialSnapshot.slug);
  const [description, setDescription] = useState(initialSnapshot.description);
  const [icon, setIcon] = useState(initialSnapshot.icon);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));
  const [nature, setNature] = useState<EntityNature>(initialSnapshot.nature);
  const [isActive, setIsActive] = useState(initialSnapshot.isActive);
  const selectedNature = getEntityNatureOption(nature);
  const dirty = isEntityTypeFormDirty(
    {
      description,
      icon,
      isActive,
      name,
      nature,
      slug,
    },
    initialSnapshot,
  );

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium">
        Nombre
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
          name="name"
          onChange={(event) => {
            const nextName = event.target.value;
            setName(nextName);

            if (!slugTouched) {
              setSlug(slugify(nextName));
            }
          }}
          required
          value={name}
        />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Slug
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
          name="slug"
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(slugify(event.target.value));
          }}
          required
          value={slug}
        />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Descripción
        <textarea
          className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
          name="description"
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </label>

      <fieldset className="grid gap-2 text-sm font-medium">
        <legend>Icono opcional</legend>
        <IconPicker
          label="Seleccionar icono de entidad"
          onIconChange={(nextIcon) => setIcon(getIconPickerFormValue(nextIcon))}
          selectedIcon={icon || null}
        />
      </fieldset>

      <label className="grid gap-2 text-sm font-medium">
        Naturaleza
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
          name="nature"
          onChange={(event) => setNature(event.target.value as EntityNature)}
          value={nature}
        >
          {entityNatureOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-muted-foreground">
          {selectedNature.description}
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          checked={isActive}
          className="h-4 w-4"
          name="isActive"
          onChange={(event) => setIsActive(event.target.checked)}
          type="checkbox"
        />
        Activo
      </label>

      <EntityTypeSubmitButton dirty={dirty} label={submitLabel} />
    </form>
  );
}

export const getEntityIconPickerOptions = getIconPickerOptions;
export const getEntityIconPickerLabel = getIconPickerLabel;
export const getEntityIconPickerFormValue = getIconPickerFormValue;

function EntityTypeSubmitButton({
  dirty,
  label,
}: {
  dirty: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending || !dirty} type="submit">
      {pending ? "Guardando..." : label}
    </Button>
  );
}
