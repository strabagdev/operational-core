import {getRelationConfig} from "./field-validation";
import { Prisma } from "@prisma/client";
import data from "./search-comparison-data.json";
import { comparisonFingerprint, fieldSearchComparison, ignoredSearchCharacters, normalizeSearchComparison, SearchComparisonError, type SearchComparison, type WorkflowSearchComparison } from "./search-comparison";

type Field = { id: string; key: string; type: string; searchable?: boolean; isActive?: boolean; multiple?: boolean; config?: unknown; options?: {value: string; label: string}[] };
const textTypes = new Set(["TEXT","TEXTAREA","EMAIL","PHONE","URL","TIME"]);
export function workflowSearchMetadata(fields: Field[], sourceEntityTypeId: string, kind: "attendance" | "state-update", query?: string | null, fieldId?: string, recordId?:string|null): WorkflowSearchComparison {
  const result = fields.filter(f=>f.isActive!==false&&f.searchable&&(textTypes.has(f.type)||f.type==="SELECT"||(kind==="state-update"&&f.type==="RELATION"&&Boolean(getRelationConfig(f.config).targetEntityTypeId)))).map(f=>{
    const policy=fieldSearchComparison(f.config);
    if(policy&&(!["TEXT","TEXTAREA"].includes(f.type)||f.multiple))throw new SearchComparisonError();
    const config=f.config&&typeof f.config==="object"?f.config as {display?:{primary?:boolean}}:{};
    return { id:f.id,key:f.key,type:f.type,primary:config.display?.primary===true,policy,...(f.type==="SELECT"?{options:(f.options??[]).map(o=>({value:o.value,label:o.label}))}:{}) };
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const selected=fieldId?result.find(f=>f.id===fieldId):null;
  if(fieldId&&selected?.policy&&!normalizeSearchComparison(query?.trim()??"",selected.policy))throw new SearchComparisonError("El texto de búsqueda queda vacío después de aplicar la comparación.","EMPTY_NORMALIZED_SEARCH");
  return {version:1,sourceEntityTypeId,fields:result,fingerprint:comparisonFingerprint(sourceEntityTypeId,result),applied:recordId?.trim()?{mode:"record"}:query?.trim()?{mode:fieldId?"field":"global",...(fieldId?{fieldId}:{})}:{mode:"definition"}};
}
export function usesWorkflowSearchComparison(metadata: WorkflowSearchComparison, fieldId?: string) { return fieldId ? Boolean(metadata.fields.find(f=>f.id===fieldId)?.policy) : metadata.fields.some(f=>f.policy); }
export function comparisonValueSql(value: Prisma.Sql, policy: SearchComparison): Prisma.Sql {
  let expression=value;
  if(policy.ignoreCase)expression=Prisma.sql`CASE WHEN getdatabaseencoding()='UTF8' AND octet_length(${expression})=char_length(${expression}) THEN translate(${expression},'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') ELSE translate(${expression},${data.foldSource},${data.foldTarget}) END`;
  const ignored=ignoredSearchCharacters(policy);
  if(ignored)expression=Prisma.sql`translate(${expression},${ignored},'')`;
  return expression;
}
export function configuredComparisonSql(value: Prisma.Sql, query: string, policy: SearchComparison): Prisma.Sql {
  const expression=comparisonValueSql(value,policy);
  const normalized=normalizeSearchComparison(query.trim(),policy);
  if(!normalized)return Prisma.sql`FALSE`;
  if(policy.match==="exact")return Prisma.sql`(${expression} COLLATE "C") = (${normalized} COLLATE "C")`;
  const literal=normalized.replace(/[\\%_]/g,"\\$&");
  return Prisma.sql`(${expression} COLLATE "C") LIKE ${`%${literal}%`} ESCAPE E'\\\\'`;
}
export function workflowSearchPredicate(metadata: WorkflowSearchComparison, query: string, fieldId?: string, alias: "subject_record" | "search_subject" = "subject_record"): Prisma.Sql {
  const id=Prisma.raw(`${alias}."id"`),display=Prisma.raw(`${alias}."displayName"`);
  const fields=fieldId?metadata.fields.filter(f=>f.id===fieldId):metadata.fields;
  const conditions:Prisma.Sql[]=[];
  if(!fieldId&&!fields.some(f=>f.primary&&f.policy))conditions.push(Prisma.sql`${display} ILIKE ${`%${query}%`}`);
  for(const field of fields){
    if(field.policy){
      if(!normalizeSearchComparison(query.trim(),field.policy))continue;
      conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM "EntityValue" search_value WHERE search_value."entityRecordId"=${id} AND search_value."entityFieldId"=${field.id} AND ${configuredComparisonSql(Prisma.sql`search_value."textValue"`,query,field.policy)})`);
    }else if(field.type==="SELECT"){
      const q=query.toLowerCase(),values=(field.options??[]).filter(o=>o.value.toLowerCase().includes(q)||o.label.toLowerCase().includes(q)).map(o=>o.value);
      if(values.length)conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM "EntityValue" search_value WHERE search_value."entityRecordId"=${id} AND search_value."entityFieldId"=${field.id} AND search_value."textValue" IN (${Prisma.join(values)}))`);
    }else if(field.type==="RELATION")conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM "EntityRelation" search_relation JOIN "EntityRecord" search_target ON search_target."id"=search_relation."targetRecordId" WHERE search_relation."sourceRecordId"=${id} AND search_relation."sourceFieldId"=${field.id} AND search_target."displayName" ILIKE ${`%${query}%`})`);
    else conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM "EntityValue" search_value WHERE search_value."entityRecordId"=${id} AND search_value."entityFieldId"=${field.id} AND search_value."textValue" ILIKE ${`%${fieldId?query.replace(/[\\%_]/g,"\\$&"):query}%`})`);
  }
  return conditions.length?Prisma.sql`(${Prisma.join(conditions," OR ")})`:Prisma.sql`FALSE`;
}
export function workflowSubjectsSql(metadata: WorkflowSearchComparison, query: string, fieldId?: string, take=20, skip=0) {
  return Prisma.sql`SELECT search_subject."id",search_subject."displayName" FROM "EntityRecord" search_subject WHERE search_subject."entityTypeId"=${metadata.sourceEntityTypeId} AND ${workflowSearchPredicate(metadata,query,fieldId,"search_subject")} ORDER BY search_subject."displayName" ASC,search_subject."id" ASC LIMIT ${take} OFFSET ${skip}`;
}
