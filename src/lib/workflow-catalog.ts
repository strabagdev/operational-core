export const workflowKeys = ["attendance"] as const;

export type WorkflowKey = typeof workflowKeys[number];

export const workflowOptions = [
  { label: "Asistencia", value: "attendance" },
] as const satisfies Array<{ label: string; value: WorkflowKey }>;

export function isWorkflowKey(value: unknown): value is WorkflowKey {
  return typeof value === "string" && workflowKeys.includes(value as WorkflowKey);
}

export function getWorkflowLabel(workflowKey: string) {
  return workflowOptions.find((option) => option.value === workflowKey)?.label ?? workflowKey;
}
