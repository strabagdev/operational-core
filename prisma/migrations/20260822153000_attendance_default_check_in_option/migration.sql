-- Preserve existing attendance configurations by promoting presentOptionId
-- to the generic default check-in option. Do not modify FieldOptions.
UPDATE "AppView"
SET "config" = jsonb_set(
  "config"::jsonb,
  '{defaultCheckInOptionId}',
  to_jsonb("config"::jsonb ->> 'presentOptionId'),
  true
)
WHERE "type" = 'WORKFLOW'
  AND COALESCE("config"::jsonb ->> 'workflowKey', "config"::jsonb ->> 'workflow') = 'attendance'
  AND ("config"::jsonb ? 'presentOptionId')
  AND NOT ("config"::jsonb ? 'defaultCheckInOptionId');
