import {it,expect,vi,beforeEach} from "vitest";
import {buildSubjectPresentationDefinition,withSubjectPresentation} from "./subject-presentation-core";
import {parseSubjectPresentation} from "./subject-presentation";
import {getAppViewInput,parseAppViewConfig} from "./app-views";
import {prisma} from "./prisma";
vi.mock("./prisma",()=>({prisma:{entityRecord:{findMany:vi.fn()},entityType:{findMany:vi.fn()}}}));
const field=(id:string,type="TEXT",config:unknown={display:{showInClient:false}})=>({id,key:id,name:"Etiqueta "+id,type,isActive:true,multiple:type==="RELATION",config,options:[],sortOrder:0,isUnique:false,required:false});
const source={id:"source",fields:[field("a"),field("b"),field("select","SELECT"),field("rel","RELATION",{targetEntityTypeId:"target",relationKind:"MANY"})]};
source.fields[2].options=[{id:"option",value:"canonical",label:"Legible",isActive:true,sortOrder:0}] as never;
const config={version:1 as const,titleFieldIds:["b","a"],secondaryFieldIds:["select","rel"]};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(prisma.entityType.findMany).mockResolvedValue([{id:"target"}] as never);vi.mocked(prisma.entityRecord.findMany).mockResolvedValue([]);});
it("validates stable IDs/order and does not use showInClient as authorization or mutate fields",()=>{
 const before=JSON.stringify(source);expect(buildSubjectPresentationDefinition(config,source)?.fields.map(f=>f.id)).toEqual(["b","a","select","rel"]);expect(JSON.stringify(source)).toBe(before);
 expect(()=>buildSubjectPresentationDefinition({...config,titleFieldIds:["foreign"]},source)).toThrow();expect(()=>buildSubjectPresentationDefinition({...config,titleFieldIds:["a","a"]},source)).toThrow();expect(()=>parseSubjectPresentation({...config,version:2})).toThrow();expect(()=>buildSubjectPresentationDefinition(config,{...source,fields:source.fields.map(f=>({...f,isActive:false}))})).toThrow();
});
it("keeps unconfigured workflow payload/reference and makes zero additional database calls",async()=>{
 const data={items:[{person:{id:"one",displayName:"Legacy"}}]};expect(await withSubjectPresentation(data,{config:{},sourceEntityType:source},"contract")).toBe(data);expect(prisma.entityRecord.findMany).not.toHaveBeenCalled();expect(prisma.entityType.findMany).not.toHaveBeenCalled();
});
it("enriches search/selected/latest in one subject batch, preserving typed values and all relation labels",async()=>{
 vi.mocked(prisma.entityRecord.findMany).mockResolvedValue([{id:"one",displayName:"Legacy",updatedAt:new Date(),values:[{entityFieldId:"a",textValue:"First"},{entityFieldId:"b",textValue:"Second"},{entityFieldId:"select",textValue:"canonical"}],outgoingRelations:["x","y"].map(id=>({sourceFieldId:"rel",targetRecordId:id,targetRecord:{id,displayName:"Cargo "+id,entityTypeId:"target",entityType:{contractId:"contract",isActive:true}}}))}] as never);
 const data={subjects:[{subject:{id:"one",displayName:"Legacy"},current:null}],latest:{items:[{subject:{id:"one",displayName:"Legacy"},recordId:"event"}],pagination:{total:1}}};
 const result=await withSubjectPresentation(data,{config:{subjectPresentation:config},sourceEntityType:source},"contract");
 expect(prisma.entityRecord.findMany).toHaveBeenCalledOnce();expect(prisma.entityType.findMany).toHaveBeenCalledOnce();expect(vi.mocked(prisma.entityRecord.findMany).mock.calls[0][0]?.where).toMatchObject({entityTypeId:"source",entityType:{contractId:"contract",isActive:true},id:{in:["one"]}});
 const row=(result.subjects[0].subject as unknown as {presentation:{cells:unknown[]}}).presentation;expect(row.cells).toMatchObject([{value:"Second"},{value:"First"},{value:"canonical"},{value:[{id:"x",displayName:"Cargo x"},{id:"y",displayName:"Cargo y"}]}]);expect(result.latest.pagination.total).toBe(1);expect(result.subjects[0].subject.displayName).toBe("Legacy");
});
it("never serializes labels from unrelated/inactive targets; read failure never blocks legacy operations",async()=>{
 vi.mocked(prisma.entityRecord.findMany).mockResolvedValue([{id:"one",displayName:"Legacy",updatedAt:new Date(),values:[],outgoingRelations:[{sourceFieldId:"rel",targetRecordId:"rogue",targetRecord:{id:"rogue",displayName:"MUST_NOT_LEAK",entityTypeId:"target",entityType:{contractId:"different",isActive:true}}}]}] as never);
 const data={items:[{person:{id:"one",displayName:"Legacy"},attendance:null}]};const ctx={config:{subjectPresentation:config},sourceEntityType:source};const result=await withSubjectPresentation(data,ctx,"contract");expect(JSON.stringify(result)).not.toContain("MUST_NOT_LEAK");expect(JSON.stringify(result)).toContain('"status":"inaccessible"');
 vi.mocked(prisma.entityRecord.findMany).mockRejectedValueOnce(Error("synthetic read failure"));const failed=await withSubjectPresentation(data,ctx,"contract");expect(failed.items).toBe(data.items);expect(failed.subjectPresentationIssue).toBeTruthy();
});
it("multipart editor input preserves ordered IDs and historical config is absent by default",()=>{
 const f=new FormData();for(const[k,v]of Object.entries({name:"Workflow",slug:"workflow",type:"WORKFLOW",subjectPresentation:JSON.stringify(config)}))f.set(k,v);
 expect(getAppViewInput(f).rawConfig.subjectPresentation).toEqual(config);expect(getAppViewInput(f).rawConfig.subjectPresentationSpecified).toBe(true);f.delete("subjectPresentation");expect(getAppViewInput(f).rawConfig.subjectPresentationSpecified).toBe(false);
 const stored={type:"WORKFLOW" as const,config:{workflowKey:"attendance",sourceEntityTypeId:"source",targetEntityTypeId:"target",personFieldId:"rel",dateFieldId:"date",statusFieldId:"state",defaultCheckInOptionId:"option",subjectPresentation:config}};expect(parseAppViewConfig(stored)).toMatchObject({subjectPresentation:config});delete(stored.config as {subjectPresentation?:unknown}).subjectPresentation;expect(parseAppViewConfig(stored)).not.toHaveProperty("subjectPresentation");
});
