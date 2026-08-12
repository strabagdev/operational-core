export type UserAdminSearchParams = {
  addUser?: string;
  error?: string;
  notice?: string;
};

export function buildUsersHref(
  basePath: string,
  currentParams: UserAdminSearchParams,
  overrides: Partial<UserAdminSearchParams>,
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
