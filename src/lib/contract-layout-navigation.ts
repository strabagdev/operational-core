import type { MembershipRole } from "@prisma/client";

import { canManageContract } from "./capabilities";

export type ContractNavigationItem = {
  href: string;
  label: "Actividad" | "Configuración" | "Registros" | "Resumen";
};

export function getContractNavigationItems({
  contractId,
  membershipRole,
}: {
  contractId: string;
  membershipRole?: MembershipRole | null;
}): ContractNavigationItem[] {
  const items: ContractNavigationItem[] = [
    { label: "Resumen", href: `/app/contracts/${contractId}` },
    {
      label: "Registros",
      href: `/app/contracts/${contractId}/records`,
    },
    {
      label: "Actividad",
      href: `/app/contracts/${contractId}/activity`,
    },
  ];

  if (canManageContract({ membershipRole })) {
    items.push({
      label: "Configuración",
      href: `/app/contracts/${contractId}/settings`,
    });
  }

  return items;
}

export function isContractNavigationItemActive({
  exact = false,
  href,
  pathname,
}: {
  exact?: boolean;
  href: string;
  pathname: string;
}) {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
