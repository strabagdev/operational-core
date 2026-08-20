export type PlatformOrganizationSearchParams = {
  createOrganization?: string;
  deactivateOrganization?: string;
  editOrganization?: string;
  error?: string;
  notice?: string;
};

export function buildPlatformOrganizationsHref(
  basePath: string,
  currentParams: PlatformOrganizationSearchParams,
  overrides: Partial<PlatformOrganizationSearchParams>,
) {
  const params = new URLSearchParams();
  const nextParams = { ...currentParams, ...overrides };

  for (const [key, value] of Object.entries(nextParams)) {
    if (!value) {
      continue;
    }

    params.set(key, value);
  }

  const query = params.toString();

  return query ? `${basePath}?${query}` : basePath;
}

export function getActivePlatformOrganizationModal(params: PlatformOrganizationSearchParams) {
  if (params.createOrganization === "1") {
    return { type: "create" as const };
  }

  if (params.editOrganization) {
    return { type: "edit" as const, organizationId: params.editOrganization };
  }

  if (params.deactivateOrganization) {
    return { type: "deactivate" as const, organizationId: params.deactivateOrganization };
  }

  return { type: "none" as const };
}
