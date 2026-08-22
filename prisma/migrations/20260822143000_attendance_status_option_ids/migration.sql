-- Backfill attendance workflow option ids only when the mapping is unambiguous.
WITH attendance_views AS (
  SELECT
    "id",
    "config"::jsonb AS config,
    "config"::jsonb ->> 'statusFieldId' AS status_field_id
  FROM "AppView"
  WHERE "type" = 'WORKFLOW'
    AND COALESCE("config"::jsonb ->> 'workflowKey', "config"::jsonb ->> 'workflow') = 'attendance'
    AND NOT ("config"::jsonb ? 'presentOptionId')
    AND NOT ("config"::jsonb ? 'absentOptionId')
),
present_options AS (
  SELECT
    view."id" AS app_view_id,
    MAX(option."id") AS option_id
  FROM attendance_views view
  JOIN "FieldOption" option
    ON option."entityFieldId" = view.status_field_id
  WHERE option."isActive" = true
    AND (
      UPPER(option."value") = 'PRESENTE'
      OR UPPER(option."label") = 'PRESENTE'
    )
  GROUP BY view."id"
  HAVING COUNT(*) = 1
),
absent_options AS (
  SELECT
    view."id" AS app_view_id,
    MAX(option."id") AS option_id
  FROM attendance_views view
  JOIN "FieldOption" option
    ON option."entityFieldId" = view.status_field_id
  WHERE option."isActive" = true
    AND (
      UPPER(option."value") = 'AUSENTE'
      OR UPPER(option."label") = 'AUSENTE'
    )
  GROUP BY view."id"
  HAVING COUNT(*) = 1
)
UPDATE "AppView" view
SET "config" =
  view."config"::jsonb ||
  jsonb_build_object(
    'presentOptionId', present_options.option_id,
    'absentOptionId', absent_options.option_id
  )
FROM present_options
JOIN absent_options
  ON absent_options.app_view_id = present_options.app_view_id
WHERE view."id" = present_options.app_view_id
  AND present_options.option_id <> absent_options.option_id;
