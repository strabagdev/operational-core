import { type ContractStatus } from "@prisma/client";

export const contractStatusLabels: Record<ContractStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  ARCHIVED: "Archivado",
};

export type ContractAdministrationStatus = ContractStatus | "ALL";

export function parseContractAdministrationStatus(
  value?: string,
): ContractAdministrationStatus {
  if (
    value === "ACTIVE" ||
    value === "INACTIVE" ||
    value === "ARCHIVED" ||
    value === "ALL"
  ) {
    return value;
  }

  return "ACTIVE";
}
