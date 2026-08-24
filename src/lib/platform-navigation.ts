import type { PlatformRole } from "@prisma/client";

import { canAccessPlatformArea } from "./capabilities";

export type PlatformNavigationItem = {
  href: string;
  label: string;
};

export function getPlatformNavigationItems(platformRole?: PlatformRole | null): PlatformNavigationItem[] {
  if (!canAccessPlatformArea({ platformRole })) {
    return [];
  }

  return [
    {
      href: "/app/platform/organizations",
      label: "Organizaciones",
    },
  ];
}
