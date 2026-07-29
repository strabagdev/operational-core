"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/format";

type EntityTypeFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initialValues?: {
    name: string;
    slug: string;
    description?: string | null;
    icon?: string | null;
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

      <label className="grid gap-2 text-sm font-medium">
        Icono opcional
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
          defaultValue={initialValues?.icon ?? ""}
          name="icon"
        />
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
