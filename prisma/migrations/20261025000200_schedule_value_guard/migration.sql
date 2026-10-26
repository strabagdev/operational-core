-- Permit transactional replacement of EAV values; forbid deletion of a report.
CREATE OR REPLACE FUNCTION opco_schedule_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data JSONB; eid TEXT; rid TEXT; config JSONB;
BEGIN
 row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='EntityRecord' THEN eid := row_data->>'entityTypeId';
 ELSE
  rid := CASE WHEN TG_TABLE_NAME='EntityValue' THEN row_data->>'entityRecordId' ELSE row_data->>'sourceRecordId' END;
  SELECT "entityTypeId" INTO eid FROM "EntityRecord" WHERE id=rid;
 END IF;
 SELECT "scheduleConfig" INTO config FROM "EntityType" WHERE id=eid FOR KEY SHARE;
 IF config->>'kind' IN ('catalog','revisions') THEN
  IF current_setting('opco.schedule_admin',true) IS DISTINCT FROM config->>'catalogId' THEN
   RAISE EXCEPTION 'SCHEDULE_CATALOG_MANAGED' USING ERRCODE='23514';
  END IF;
 ELSIF config->>'kind'='consumer' THEN
  IF (TG_TABLE_NAME='EntityRecord' AND TG_OP='DELETE') OR current_setting('opco.schedule_binding',true) IS DISTINCT FROM config->>'bindingId' THEN
   RAISE EXCEPTION 'SCHEDULE_WORKFLOW_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='EntityRecord' AND TG_OP='UPDATE' AND (to_jsonb(OLD)->'scheduleApplication') IS DISTINCT FROM (to_jsonb(NEW)->'scheduleApplication') THEN
   RAISE EXCEPTION 'SCHEDULE_APPLICATION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
