CREATE TABLE "StateUpdateIdentityDefinition" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL, "targetEntityTypeId" TEXT NOT NULL UNIQUE REFERENCES "EntityType"("id") ON DELETE RESTRICT,
 "subjectFieldId" TEXT NOT NULL, "dateFieldId" TEXT NOT NULL, "fieldIds" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE "StateUpdateIdentitySlot" (
 "id" TEXT PRIMARY KEY, "definitionId" TEXT NOT NULL REFERENCES "StateUpdateIdentityDefinition"("id") ON DELETE RESTRICT,
 "canonicalKey" TEXT NOT NULL, "identityHash" TEXT NOT NULL, "contextKey" TEXT NOT NULL,
 "date" DATE NOT NULL, "subjectRecordId" TEXT NOT NULL, "recordId" TEXT UNIQUE REFERENCES "EntityRecord"("id") ON DELETE RESTRICT,
 UNIQUE("definitionId", "identityHash")
);
CREATE INDEX "StateUpdateIdentitySlot_definitionId_date_contextKey_idx" ON "StateUpdateIdentitySlot"("definitionId", "date", "contextKey");
-- Every supported writer (including generic writes, bulk/import and deletion) is fenced.
-- The entity lock also serializes opt-in activation against an in-flight legacy CREATE.
CREATE FUNCTION opco_composite_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid TEXT; did TEXT; rid TEXT; selected_row JSONB;
BEGIN
 selected_row := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='EntityRecord' THEN eid := selected_row->>'entityTypeId';
 ELSE
  IF TG_TABLE_NAME='EntityValue' THEN rid := selected_row->>'entityRecordId';
  ELSE rid := selected_row->>'sourceRecordId'; END IF;
  SELECT "entityTypeId" INTO eid FROM "EntityRecord" WHERE id=rid;
 END IF;
 PERFORM 1 FROM "EntityType" WHERE id=eid FOR KEY SHARE;
 SELECT id INTO did FROM "StateUpdateIdentityDefinition" WHERE "targetEntityTypeId"=eid;
 IF did IS NOT NULL AND current_setting('opco.composite_identity',true) IS DISTINCT FROM did THEN
  RAISE EXCEPTION 'COMPOSITE_WORKFLOW_REQUIRED: use the configured workflow; generic writes and deletion are disabled for this entity' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER opco_composite_record_guard BEFORE INSERT OR UPDATE OR DELETE ON "EntityRecord" FOR EACH ROW EXECUTE FUNCTION opco_composite_write_guard();
CREATE TRIGGER opco_composite_value_guard BEFORE INSERT OR UPDATE OR DELETE ON "EntityValue" FOR EACH ROW EXECUTE FUNCTION opco_composite_write_guard();
CREATE TRIGGER opco_composite_relation_guard BEFORE INSERT OR UPDATE OR DELETE ON "EntityRelation" FOR EACH ROW EXECUTE FUNCTION opco_composite_write_guard();
CREATE FUNCTION opco_composite_field_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fid TEXT; old_row JSONB; new_row JSONB;
BEGIN
 old_row := to_jsonb(OLD); new_row := to_jsonb(NEW);
 fid := CASE WHEN TG_TABLE_NAME='FieldOption' THEN old_row->>'entityFieldId' ELSE old_row->>'id' END;
 IF EXISTS (SELECT 1 FROM "StateUpdateIdentityDefinition" WHERE "subjectFieldId"=fid OR "dateFieldId"=fid OR "fieldIds" ? fid) THEN
  IF TG_TABLE_NAME='EntityField' THEN
   IF TG_OP='DELETE' OR (new_row-ARRAY['name','sortOrder','updatedAt']) IS DISTINCT FROM (old_row-ARRAY['name','sortOrder','updatedAt']) THEN
    RAISE EXCEPTION 'COMPOSITE_IDENTITY_FIELD_IMMUTABLE' USING ERRCODE='23514'; END IF;
  ELSE
   IF TG_OP='DELETE' OR new_row->>'entityFieldId' IS DISTINCT FROM old_row->>'entityFieldId' OR new_row->>'value' IS DISTINCT FROM old_row->>'value' THEN
    RAISE EXCEPTION 'COMPOSITE_IDENTITY_OPTION_IMMUTABLE' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER opco_composite_field_guard BEFORE UPDATE OR DELETE ON "EntityField" FOR EACH ROW EXECUTE FUNCTION opco_composite_field_guard();
CREATE TRIGGER opco_composite_option_guard BEFORE UPDATE OR DELETE ON "FieldOption" FOR EACH ROW EXECUTE FUNCTION opco_composite_field_guard();
