import { describe, expect, it } from "vitest";

import { getPlatformNavigationItems } from "./platform-navigation";

describe("platform navigation", () => {
  it("shows platform links only to PLATFORM_ADMIN users", () => {
    expect(getPlatformNavigationItems("PLATFORM_ADMIN")).toEqual([
      {
        href: "/app/platform/organizations",
        label: "Organizaciones",
      },
    ]);
    expect(getPlatformNavigationItems("NONE")).toEqual([]);
    expect(getPlatformNavigationItems()).toEqual([]);
  });
});
