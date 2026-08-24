import { describe, expect, it } from "vitest";

import {
  canAccessPlatformArea,
  canConfigureEntities,
  canCreateRecords,
  canDeleteRecords,
  canEditRecords,
  canExportRecords,
  canImportRecords,
  canManageContract,
  canManageExternalApps,
  canManageUsers,
  canManageViewAccess,
  canManageViews,
} from "./capabilities";

describe("role capabilities", () => {
  it("allows MEMBER users to operate entity records without schema administration", () => {
    const context = { membershipRole: "MEMBER" as const };

    expect(canCreateRecords(context)).toBe(true);
    expect(canEditRecords(context)).toBe(true);
    expect(canDeleteRecords(context)).toBe(true);
    expect(canImportRecords(context)).toBe(true);
    expect(canExportRecords(context)).toBe(true);
    expect(canConfigureEntities(context)).toBe(false);
    expect(canManageViews(context)).toBe(false);
    expect(canManageViewAccess(context)).toBe(false);
    expect(canManageUsers(context)).toBe(false);
    expect(canManageExternalApps(context)).toBe(false);
    expect(canManageContract(context)).toBe(false);
  });

  it("allows ADMIN users to manage contract configuration", () => {
    const context = { membershipRole: "ADMIN" as const };

    expect(canCreateRecords(context)).toBe(true);
    expect(canConfigureEntities(context)).toBe(true);
    expect(canManageViews(context)).toBe(true);
    expect(canManageViewAccess(context)).toBe(true);
    expect(canManageUsers(context)).toBe(true);
    expect(canManageExternalApps(context)).toBe(true);
    expect(canManageContract(context)).toBe(true);
  });

  it("keeps PLATFORM_ADMIN separate from operational contract permissions", () => {
    const context = { platformRole: "PLATFORM_ADMIN" as const };

    expect(canAccessPlatformArea(context)).toBe(true);
    expect(canManageContract(context)).toBe(false);
    expect(canCreateRecords(context)).toBe(false);
    expect(canConfigureEntities(context)).toBe(false);
  });
});
