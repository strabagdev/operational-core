import type { PlatformRole } from "@prisma/client";

export type PlatformNavigationItem = {
  href: string;
  label: string;
};

export function getPlatformNavigationItems(platformRole?: PlatformRole | null): PlatformNavigationItem[] {
  if (platformRole !== "PLATFORM_ADMIN") {
    return [];
  }

  return [
    {
      href: "/app/platform/organizations",
      label: "Organizaciones",
    },
  ];
}
