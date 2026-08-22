-- Rename legacy WORKFLOW config key from "workflow" to "workflowKey".
UPDATE "AppView"
SET "config" = ("config"::jsonb - 'workflow') || jsonb_build_object('workflowKey', "config"::jsonb -> 'workflow')
WHERE "type" = 'WORKFLOW'
  AND "config"::jsonb ? 'workflow'
  AND NOT ("config"::jsonb ? 'workflowKey');
