/** Server-only opt-in. Empty/malformed policy denies; no entity or workflow writes change. */
export function selectiveReuseEnabled(contractId: string, environment: Record<string,string|undefined> = process.env) {
  if (environment.OPCO_OFFLINE_REUSE_POLICY !== "attendance-runtime-v1") return false;
  const ids = (environment.OPCO_OFFLINE_REUSE_CONTRACT_IDS ?? "").split(",");
  return ids.length <= 100 && ids.every(id => /^[A-Za-z0-9_-]{1,200}$/.test(id)) && ids.includes(contractId);
}
