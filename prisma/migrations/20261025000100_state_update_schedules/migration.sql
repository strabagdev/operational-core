-- Opt-in JSON only. Existing records/configurations keep SQL NULL; no backfill.
ALTER TABLE "EntityType" ADD COLUMN "scheduleConfig" JSONB;
ALTER TABLE "EntityRecord" ADD COLUMN "scheduleApplication" JSONB;

CREATE FUNCTION opco_schedule_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF TG_OP='DELETE' OR current_setting('opco.schedule_binding',true) IS DISTINCT FROM config->>'bindingId' THEN
   RAISE EXCEPTION 'SCHEDULE_WORKFLOW_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='EntityRecord' AND TG_OP='UPDATE' AND OLD."scheduleApplication" IS DISTINCT FROM NEW."scheduleApplication" THEN
   RAISE EXCEPTION 'SCHEDULE_APPLICATION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER opco_schedule_record_guard BEFORE INSERT OR UPDATE OR DELETE ON "EntityRecord" FOR EACH ROW EXECUTE FUNCTION opco_schedule_record_guard();
CREATE TRIGGER opco_schedule_value_guard BEFORE INSERT OR UPDATE OR DELETE ON "EntityValue" FOR EACH ROW EXECUTE FUNCTION opco_schedule_record_guard();
CREATE TRIGGER opco_schedule_relation_guard BEFORE INSERT OR UPDATE OR DELETE ON "EntityRelation" FOR EACH ROW EXECUTE FUNCTION opco_schedule_record_guard();

CREATE FUNCTION opco_schedule_structure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid TEXT; config JSONB; row_data JSONB;
BEGIN
 row_data := CASE WHEN TG_OP='INSERT' THEN to_jsonb(NEW) ELSE to_jsonb(OLD) END;
 IF TG_TABLE_NAME='EntityType' THEN
  config := row_data->'scheduleConfig';
  IF TG_OP='UPDATE' AND NEW."scheduleConfig" IS DISTINCT FROM OLD."scheduleConfig" AND
     current_setting('opco.schedule_config',true) IS DISTINCT FROM OLD."contractId" THEN
   RAISE EXCEPTION 'SCHEDULE_CONFIG_MANAGED' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND config IS NOT NULL AND config <> 'null'::jsonb AND
     current_setting('opco.schedule_config',true) IS DISTINCT FROM NEW."contractId" THEN
   RAISE EXCEPTION 'SCHEDULE_CONFIG_MANAGED' USING ERRCODE='23514';
  END IF;
 ELSE
  IF TG_TABLE_NAME='EntityField' THEN eid := row_data->>'entityTypeId';
  ELSE SELECT "entityTypeId" INTO eid FROM "EntityField" WHERE id=row_data->>'entityFieldId'; END IF;
  SELECT "scheduleConfig" INTO config FROM "EntityType" WHERE id=eid FOR KEY SHARE;
 END IF;
 IF config->>'kind' IN ('catalog','revisions') AND
    current_setting('opco.schedule_admin',true) IS DISTINCT FROM config->>'catalogId' THEN
  RAISE EXCEPTION 'SCHEDULE_STRUCTURE_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='EntityType' AND TG_OP='DELETE' AND config->>'kind'='consumer' THEN
  RAISE EXCEPTION 'SCHEDULE_CONFIG_MANAGED' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER opco_schedule_type_guard BEFORE INSERT OR UPDATE OR DELETE ON "EntityType" FOR EACH ROW EXECUTE FUNCTION opco_schedule_structure_guard();
CREATE TRIGGER opco_schedule_field_guard BEFORE INSERT OR UPDATE OR DELETE ON "EntityField" FOR EACH ROW EXECUTE FUNCTION opco_schedule_structure_guard();
CREATE TRIGGER opco_schedule_option_guard BEFORE INSERT OR UPDATE OR DELETE ON "FieldOption" FOR EACH ROW EXECUTE FUNCTION opco_schedule_structure_guard();
