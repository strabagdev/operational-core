export type ExternalAppAdminSearchParams = {
  createApp?: string;
  editApp?: string;
  error?: string;
  notice?: string;
};

export function buildExternalAppsHref(
  basePath: string,
  currentParams: ExternalAppAdminSearchParams,
  overrides: Partial<ExternalAppAdminSearchParams>,
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

export function getActiveExternalAppAdminModal(
  params: ExternalAppAdminSearchParams,
) {
  if (params.createApp === "1") {
    return { type: "create" as const };
  }

  if (params.editApp) {
    return { type: "edit" as const, appId: params.editApp };
  }

  return { type: "none" as const };
}
