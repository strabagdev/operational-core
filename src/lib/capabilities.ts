import type { MembershipRole, PlatformRole } from "@prisma/client";

export type CapabilityContext = {
  membershipRole?: MembershipRole | null;
  platformRole?: PlatformRole | null;
};

export function canAccessPlatformArea(context: CapabilityContext) {
  return context.platformRole === "PLATFORM_ADMIN";
}

export function canManageContract(context: CapabilityContext) {
  return context.membershipRole === "ADMIN";
}

export function canManageUsers(context: CapabilityContext) {
  return canManageContract(context);
}

export function canManageExternalApps(context: CapabilityContext) {
  return canManageContract(context);
}

export function canManageViews(context: CapabilityContext) {
  return canManageContract(context);
}

export function canManageViewAccess(context: CapabilityContext) {
  return canManageViews(context);
}

export function canConfigureEntities(context: CapabilityContext) {
  return canManageContract(context);
}

export function canCreateRecords(context: CapabilityContext) {
  return Boolean(context.membershipRole);
}

export function canEditRecords(context: CapabilityContext) {
  return Boolean(context.membershipRole);
}

export function canDeleteRecords(context: CapabilityContext) {
  return Boolean(context.membershipRole);
}

export function canImportRecords(context: CapabilityContext) {
  return Boolean(context.membershipRole);
}

export function canExportRecords(context: CapabilityContext) {
  return Boolean(context.membershipRole);
}
