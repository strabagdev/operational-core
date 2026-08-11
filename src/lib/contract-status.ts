import { type ContractStatus } from "@prisma/client";

export const contractStatusLabels: Record<ContractStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  ARCHIVED: "Archivado",
};
