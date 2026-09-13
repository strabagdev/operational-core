"use client";

import { useState } from "react";
import { Check, ChevronDown, Search, Slash } from "lucide-react";

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
import { cn } from "@/lib/utils";

export type IconPickerOption = {
  icon: EntityIconKey | null;
  key: string;
  label: string;
};

export function getIconPickerOptions(query: string): IconPickerOption[] {
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
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.key.toLowerCase().includes(normalizedQuery),
    ),
  ];
}

export function getIconPickerLabel(icon: string | null | undefined) {
  if (!icon) {
    return "Sin icono";
  }

  return getEntityIconOption(icon)?.label ?? `Ícono desconocido: ${icon}`;
}

export function getIconPickerFormValue(icon: string | null | undefined) {
  return icon ?? "";
}

export function IconPicker({
  describedBy,
  label = "Seleccionar icono",
  name = "icon",
  onIconChange,
  selectedIcon,
}: {
  describedBy?: string;
  label?: string;
  name?: string;
  onIconChange: (icon: string | null) => void;
  selectedIcon: string | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const options = getIconPickerOptions(query);
  const selectedLabel = getIconPickerLabel(selectedIcon);
  const selectedKnown = !selectedIcon || Boolean(getEntityIconOption(selectedIcon));

  function selectIcon(icon: EntityIconKey | null) {
    onIconChange(icon);
    setQuery("");
    setOpen(false);
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <input name={name} type="hidden" value={getIconPickerFormValue(selectedIcon)} />
      <DropdownMenuTrigger asChild>
        <button
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={label}
          className="flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring transition-colors hover:bg-accent focus-visible:ring-2"
          type="button"
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconPickerGlyph icon={selectedIcon} />
            <span className="truncate" title={selectedLabel}>{selectedLabel}</span>
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(22rem,calc(100vh-6rem))] w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-2" role="listbox">
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
        {!selectedKnown ? (
          <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
            Se conservará el valor legacy desconocido hasta que selecciones otro ícono.
          </p>
        ) : null}
        <div className="max-h-72 overflow-y-auto">
          {options.map((option) => {
            const selected = (selectedIcon || null) === option.icon;

            return (
              <DropdownMenuItem
                aria-selected={selected}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-md",
                  selected && "bg-accent",
                )}
                key={option.key}
                onSelect={() => selectIcon(option.icon)}
                role="option"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <IconPickerGlyph icon={option.icon} />
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

export function IconPickerGlyph({ icon }: { icon: string | null }) {
  if (!icon) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground" aria-hidden="true">
        <Slash className="h-3.5 w-3.5" />
      </span>
    );
  }

  const known = getEntityIconOption(icon);

  if (!known) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-xs font-medium text-amber-950" aria-hidden="true">
        ?
      </span>
    );
  }

  const Icon = known.icon;

  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30 text-foreground">
      <Icon
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-current opacity-100"
        strokeWidth={1.8}
      />
    </span>
  );
}
