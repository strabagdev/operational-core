import type { EntityNature } from "@prisma/client";

export const entityNatureValues = ["MASTER", "TRANSACTION", "REFERENCE"] as const;

export const entityNatureOptions = [
  {
    description: "Catálogo estable reutilizado por otros registros.",
    label: "Maestra",
    value: "MASTER",
  },
  {
    description: "Evento u operación que ocurre en el tiempo.",
    label: "Transaccional",
    value: "TRANSACTION",
  },
  {
    description: "Tabla auxiliar o referencia de apoyo.",
    label: "Referencia",
    value: "REFERENCE",
  },
] as const satisfies Array<{
  description: string;
  label: string;
  value: EntityNature;
}>;

export function getEntityNatureOption(value: EntityNature | string | null | undefined) {
  return entityNatureOptions.find((option) => option.value === value) ?? entityNatureOptions[0];
}

export function getEntityNatureLabel(value: EntityNature | string | null | undefined) {
  return getEntityNatureOption(value).label;
}
