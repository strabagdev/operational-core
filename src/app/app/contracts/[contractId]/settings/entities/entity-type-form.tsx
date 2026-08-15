"use client";

import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { EntityNature } from "@prisma/client";

import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  entityIconOptions,
  getEntityIconOption,
  type EntityIconKey,
} from "@/lib/entity-icons";
import { entityNatureOptions, getEntityNatureOption } from "@/lib/entity-nature";
import { slugify } from "@/lib/format";
import { cn } from "@/lib/utils";

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

export function EntityTypeForm({
  action,
  submitLabel,
  initialValues,
}: EntityTypeFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [slug, setSlug] = useState(initialValues?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));
  const [nature, setNature] = useState<EntityNature>(initialValues?.nature ?? "MASTER");
  const selectedNature = getEntityNatureOption(nature);

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
          defaultValue={initialValues?.description ?? ""}
          name="description"
        />
      </label>

      <fieldset className="grid gap-2 text-sm font-medium">
        <legend>Icono opcional</legend>
        <EntityIconPicker initialIcon={initialValues?.icon ?? null} />
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
          className="h-4 w-4"
          defaultChecked={initialValues?.isActive ?? true}
          name="isActive"
          type="checkbox"
        />
        Activo
      </label>

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

type IconPickerOption = {
  icon: EntityIconKey | null;
  key: string;
  label: string;
};

export function getEntityIconPickerOptions(query: string): IconPickerOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  const noIconOption = { icon: null, key: "none", label: "Sin icono" };
  const iconOptions = entityIconOptions.map((option) => ({
    icon: option.key,
    key: option.key,
    label: option.label,
  }));

  if (!normalizedQuery) {
    return [noIconOption, ...iconOptions];
  }

  return [
    noIconOption,
    ...iconOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery),
    ),
  ];
}

export function getEntityIconPickerLabel(icon: string | null | undefined) {
  return getEntityIconOption(icon)?.label ?? "Sin icono";
}

export function getEntityIconPickerFormValue(icon: string | null | undefined) {
  return icon ?? "";
}

function EntityIconPicker({ initialIcon }: { initialIcon: string | null }) {
  const [selectedIcon, setSelectedIcon] = useState(initialIcon);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const options = getEntityIconPickerOptions(query);
  const selectedLabel = getEntityIconPickerLabel(selectedIcon);

  function selectIcon(icon: EntityIconKey | null) {
    setSelectedIcon(icon);
    setQuery("");
    setOpen(false);
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <input name="icon" type="hidden" value={getEntityIconPickerFormValue(selectedIcon)} />
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Seleccionar icono de entidad"
          className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring transition-colors hover:bg-accent focus-visible:ring-2"
          type="button"
        >
          <span className="flex min-w-0 items-center gap-2">
            <EntityIcon className="text-muted-foreground" icon={selectedIcon} />
            <span className="truncate">{selectedLabel}</span>
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-2">
        <div className="relative mb-2">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            aria-label="Buscar icono"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Buscar icono"
            value={query}
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {options.map((option) => {
            const selected = (selectedIcon ?? null) === option.icon;

            return (
              <DropdownMenuItem
                className={cn("flex cursor-pointer items-center justify-between gap-3", selected && "bg-accent")}
                key={option.key}
                onSelect={() => selectIcon(option.icon)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <EntityIcon className="text-muted-foreground" icon={option.icon} />
                  <span className="truncate">{option.label}</span>
                </span>
                {selected ? (
                  <Check aria-hidden="true" className="h-4 w-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
          {options.length === 1 && query.trim() ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No hay iconos para esta búsqueda.
            </p>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
