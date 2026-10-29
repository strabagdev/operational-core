import { prisma } from "./prisma";
import { getRelationConfig } from "./field-validation";
import { serializeApiEntityRecord } from "./api-entity-serializer";
import { parseSubjectPresentation, presentationFingerprint, projectSubject, subjectPresentationTypes, type SubjectPresentationDefinition, type SubjectPresentationField, type SubjectPresentationProjection } from "./subject-presentation";

type SourceField = {id:string;key:string;name:string;type:string;isActive:boolean;multiple:boolean;config:unknown;options?:{id:string;value:string;label:string;isActive:boolean;sortOrder?:number}[]};
export function buildSubjectPresentationDefinition(raw:unknown,source:{id:string;fields:SourceField[]}):SubjectPresentationDefinition|undefined {
 const config=parseSubjectPresentation(raw);if(!config)return undefined;
 const ids=[...new Set([...config.titleFieldIds,...config.secondaryFieldIds])];
 const fields:SubjectPresentationField[]=ids.map(id=>{
  const f=source.fields.find(f=>f.id===id&&f.isActive);if(!f||!subjectPresentationTypes.has(f.type))throw Error("SUBJECT_PRESENTATION_FIELD_UNAVAILABLE");
  const original=f.config&&typeof f.config==="object"&&!Array.isArray(f.config)?f.config as Record<string,unknown>:{};
  const relation=f.type==="RELATION"?getRelationConfig(f.config):null;if(relation&&!relation.targetEntityTypeId)throw Error("SUBJECT_PRESENTATION_FIELD_UNAVAILABLE");
  return {id:f.id,key:f.key,name:f.name,type:f.type,multiple:f.multiple,config:{...(original.validation?{validation:original.validation}:{}),...(original.money?{money:original.money}:{})},...(["SELECT","MULTISELECT"].includes(f.type)?{options:(f.options??[]).map(o=>({value:o.value,label:o.label}))}:{}),...(relation?{targetEntityTypeId:relation.targetEntityTypeId}:{})};
 });
 return {version:1,sourceEntityTypeId:source.id,config,fields,fingerprint:presentationFingerprint(source.id,config,fields)};
}
/** Read-only enrichment after the workflow selects its rows. One bounded batch, no N+1. */
export async function withSubjectPresentation<T extends object>(data:T,context:{config:{subjectPresentation?:unknown};sourceEntityType:{id:string;fields:SourceField[]}},contractId:string):Promise<T&{subjectPresentation?:SubjectPresentationDefinition;subjectPresentationIssue?:string}> {
 if(context.config.subjectPresentation===undefined)return data;
 let definition:SubjectPresentationDefinition|undefined;
 try {definition=buildSubjectPresentationDefinition(context.config.subjectPresentation,context.sourceEntityType);}catch{return {...data,subjectPresentationIssue:"La presentación configurada no está disponible; se conserva la identificación anterior."};}
 if(!definition)return data;
 type Row=Record<string,unknown>;const raw=data as Row;
 const arrays=[raw.items,raw.subjects,Array.isArray(raw.latest)?raw.latest:(raw.latest as Row|undefined)?.items].filter(Array.isArray) as Row[][];
 const subjects=arrays.flat().map(row=>row.subject??row.person).filter((x):x is {id:string;displayName:string}=>!!x&&typeof x==="object"&&"id" in x);
 const ids=[...new Set(subjects.map(s=>s.id))];
 try {
  const capturedAt=new Date().toISOString();
  const relatedIds=[...new Set(definition.fields.flatMap(f=>f.targetEntityTypeId?[f.targetEntityTypeId]:[]))];
  if(relatedIds.length){const targets=await prisma.entityType.findMany({where:{id:{in:relatedIds},contractId,isActive:true},select:{id:true}});const readable=new Set(targets.map(t=>t.id));definition={...definition,fields:definition.fields.map(f=>f.type==="RELATION"?{...f,relationReadable:readable.has(f.targetEntityTypeId!)}:f)};definition.fingerprint=presentationFingerprint(definition.sourceEntityTypeId,definition.config,definition.fields);}
  const records=ids.length?await prisma.entityRecord.findMany({where:{entityTypeId:definition.sourceEntityTypeId,entityType:{contractId,isActive:true},id:{in:ids}},include:{values:{where:{entityFieldId:{in:definition.fields.map(f=>f.id)}}},outgoingRelations:{where:{sourceFieldId:{in:definition.fields.filter(f=>f.type==="RELATION").map(f=>f.id)}},include:{targetRecord:{select:{id:true,displayName:true,entityTypeId:true,entityType:{select:{contractId:true,isActive:true}}}}}}}}):[];
  const projections=new Map<string,SubjectPresentationProjection>();
  for(const record of records){
   const inaccessible:string[]=[];
   const relations=record.outgoingRelations.filter(relation=>{
    const f=definition!.fields.find(f=>f.id===relation.sourceFieldId);const target=relation.targetRecord;
    const allowed=!!f&&target.entityTypeId===f.targetEntityTypeId&&target.entityType.contractId===contractId&&target.entityType.isActive;
    if(!allowed)inaccessible.push(relation.sourceFieldId);return allowed;
   });
   const sourceFields=context.sourceEntityType.fields.filter(f=>definition!.fields.some(d=>d.id===f.id));
   const serialized=serializeApiEntityRecord({record:{...record,outgoingRelations:relations},fields:sourceFields as Parameters<typeof serializeApiEntityRecord>[0]["fields"]});
   projections.set(record.id,projectSubject(definition,record.id,serialized.values,inaccessible,record.updatedAt.toISOString(),capturedAt));
  }
  const decorate=(rows:Row[])=>rows.map(row=>{const key=row.subject?"subject":"person";const subject=row[key] as {id:string;displayName:string}|null;if(!subject)return row;return {...row,[key]:{...subject,...(projections.has(subject.id)?{presentation:projections.get(subject.id)}:{})}};});
  return {...data,subjectPresentation:definition,...(Array.isArray(raw.items)?{items:decorate(raw.items)}:{}),...(Array.isArray(raw.subjects)?{subjects:decorate(raw.subjects)}:{}),...(Array.isArray(raw.latest)?{latest:decorate(raw.latest)}:raw.latest&&typeof raw.latest==="object"?{latest:{...raw.latest,items:decorate((raw.latest as Row).items as Row[])}}:{})} as T&{subjectPresentation:SubjectPresentationDefinition};
 }catch{return {...data,subjectPresentation:definition,subjectPresentationIssue:"No se pudieron preparar los datos de presentación; las operaciones del registro siguen disponibles."};}
}
