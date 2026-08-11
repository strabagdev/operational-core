export type ContractAdminSearchParams = {
  q?: string;
  status?: string;
  archiveContract?: string;
  createContract?: string;
  editContract?: string;
  deleteContract?: string;
  error?: string;
  notice?: string;
};

export function buildContractsHref(
  basePath: string,
  currentParams: ContractAdminSearchParams,
  overrides: Partial<ContractAdminSearchParams>,
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

export function getActiveContractAdminModal(params: ContractAdminSearchParams) {
  if (params.createContract === "1") {
    return { type: "create" as const };
  }

  if (params.editContract) {
    return { type: "edit" as const, contractId: params.editContract };
  }

  if (params.archiveContract) {
    return { type: "archive" as const, contractId: params.archiveContract };
  }

  if (params.deleteContract) {
    return { type: "delete" as const, contractId: params.deleteContract };
  }

  return { type: "none" as const };
}
