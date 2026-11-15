/** Server-only opt-in. Empty/malformed policy denies; no entity or workflow writes change. */
export function selectiveReuseEnabled(contractId: string, environment: Record<string,string|undefined> = process.env) {
  if (environment.OPCO_OFFLINE_REUSE_POLICY !== "attendance-runtime-v1") return false;
  const ids = (environment.OPCO_OFFLINE_REUSE_CONTRACT_IDS ?? "").split(",");
  return ids.length <= 100 && ids.every(id => /^[A-Za-z0-9_-]{1,200}$/.test(id)) && ids.includes(contractId);
}

/** Independent opt-in; the Attendance contract gate above is unchanged. */
export function genericReuseEnabled(environment: Record<string,string|undefined> = process.env) {
  return environment.OPCO_OFFLINE_GENERIC_REUSE_POLICY === "verified-coverage-runtime-v1";
}

export function genericReuseKinds(type: string, workflowKey: string | null) {
  if (type === "RECORDS") return ["metadata-only", "field-options-and-direct-catalogs", "unfiltered-collection"];
  if (type === "PANEL" || type === "REPORT") return ["metadata-only", "exact-query-window"];
  if (type !== "WORKFLOW") return [];
  if (workflowKey === "attendance") return ["field-options-and-direct-catalogs"];
  if (workflowKey === "state-update") return ["field-options-and-direct-catalogs", "context-required", "state-update-snapshot", "state-update-current"];
  return [];
}
