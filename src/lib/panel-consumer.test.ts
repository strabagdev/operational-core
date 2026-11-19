import { beforeEach, describe, expect, it, vi } from "vitest";
import { panelFixtureConfig, panelFixtureDefinitions, panelFixtureIds } from "../test/panel-local-fixture";
import { parseAppViewConfig } from "./app-views";
import { PANEL_FEATURES, panelConsumerFeatures, panelCompatibility, requiredPanelFeatures, panelReadRepresentation } from "./panel-consumer";
import { projectPanelViewsForConsumer, type SerializedApiAppView } from "./api-app-views";
import { buildOfflineManifest, parseOfflineManifestRequest } from "./offline-manifest";
import { getApiPanel } from "./panels";
const { app, entity, records, access, catalog, revisions } = vi.hoisted(() => ({ app: vi.fn(), entity: vi.fn(), records: vi.fn(), access: vi.fn(), catalog: vi.fn(), revisions: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { appView: { findFirst: app }, entityType: { findFirst: entity }, entityRecord: { findMany: records } } }));
vi.mock("./offline-revisions", () => ({ readOfflineRevisionCatalog: catalog, readOfflineEntityRevisions: revisions }));
vi.mock("./app-view-access", () => ({ userCanAccessAppView: access, getEffectiveAppViewsForUserContract: vi.fn() }));
const accept="application/json;opco-panel=1;features="+PANEL_FEATURES.join(".");
const view=()=>({id:"p",type:"PANEL",name:"Configurable",slug:"configurable",icon:null,sortOrder:0,config:panelFixtureConfig(),configRevision:"r2"}) as unknown as SerializedApiAppView;
beforeEach(()=>{vi.clearAllMocks();access.mockResolvedValue(true);app.mockResolvedValue({id:"p",name:"Configurable",slug:"configurable",type:"PANEL",config:panelFixtureConfig()});});
describe("PANEL consumer compatibility",()=>{
 it("negotiates compact capture only when that column is configured",()=>{const config=parseAppViewConfig({type:"PANEL",config:panelFixtureConfig()});if(config.type!=="PANEL")throw Error();const m=config.modules.find(m=>m.visualization.type==="TABLE")!;if(m.visualization.type!=="TABLE")throw Error();m.visualization.config.columns[0].captureTime={timeZone:"UTC"};expect(requiredPanelFeatures(config)).toContain("capture-time-v1");expect(panelCompatibility(config,"r",PANEL_FEATURES.filter(f=>f!=="capture-time-v1"))?.status).toBe("update-required");});
 it("does not infer capabilities from absent, malformed, duplicate or unknown-version declarations",()=>{
  for(const value of [null,"application/json","*/*","application/json;opco-panel=2;features=groups-v1","application/json;opco-panel=1;opco-panel=1;features=groups-v1",'application/json;opco-panel=1;features="groups-v1"'])expect(panelConsumerFeatures(value)).toEqual([]);
  expect(panelConsumerFeatures(accept)).toEqual(PANEL_FEATURES);
  expect(panelConsumerFeatures("application/json; opco-panel=1; features=groups-v1.future-v9")).toEqual(["groups-v1"]);
 });
 it("derives independent requirements and keeps legacy representations identical",()=>{
  const config=parseAppViewConfig({type:"PANEL",config:panelFixtureConfig()});if(config.type!=="PANEL")throw Error();
  expect(requiredPanelFeatures(config)).toEqual(PANEL_FEATURES.filter(f=>f!=="capture-time-v1"));
  expect(panelCompatibility(config,"r",["groups-v1"])).toMatchObject({status:"update-required",accepted:["groups-v1"]});
  config.filters.forEach(filter=>delete filter.defaultValue);config.datasets.forEach(dataset=>{delete dataset.groupBy;delete dataset.relationCounts;});
  expect(panelCompatibility(config,"r",[])).toBeUndefined();
 });
 it("projects only incompatible views into a valid legacy TABLE shell, without altering stored configuration or assignments",()=>{
  const original=view(),snapshot=JSON.stringify(original);const compatible={...original,id:"legacy",type:"RECORDS",config:{entityTypeId:"e"}}as SerializedApiAppView;
  const projected=projectPanelViewsForConsumer([compatible,original],[]);
  expect(projected[0]).toBe(compatible);expect(projected.map(view=>view.id)).toEqual(["legacy","p"]);
  expect(projected[1]).toMatchObject({name:original.name,configRevision:"r2",panelCompatibility:{status:"update-required",required:PANEL_FEATURES.filter(f=>f!=="capture-time-v1"),accepted:[]}});
  const parsed=parseAppViewConfig({type:"PANEL",config:projected[1].config});expect(parsed.type).toBe("PANEL");
  if(parsed.type!=="PANEL")throw Error();expect(parsed.filters).toEqual([]);expect(parsed.metrics).toEqual([]);expect(parsed.datasets[0].groupBy).toBeUndefined();expect(parsed.datasets[0].relationCounts).toBeUndefined();expect(parsed.modules[0].title).toBe("Actualización necesaria");
  expect(JSON.stringify(original)).toBe(snapshot);
  expect(projectPanelViewsForConsumer([original],PANEL_FEATURES)[0].config).toBe(original.config);
 });
 it("rejects direct reads before any business lookup, including stale/invalid selectors",async()=>{
  for(const consumer of [[],["groups-v1"]]){
   const result=await getApiPanel({appViewId:"p",contractId:"c",userId:"u",consumerFeatures:consumer,query:{datasetId:"obsolete"}});
   expect(result.ok).toBe(false);if(result.ok)throw Error();expect(result.response.status).toBe(426);expect(await result.response.json()).toMatchObject({ok:false,error:{code:"PANEL_CLIENT_UPDATE_REQUIRED",message:expect.stringContaining("actualizar Opco Client")}});
  }
  expect(entity).not.toHaveBeenCalled();expect(records).not.toHaveBeenCalled();
 });
 it("checks permissions before exposing even compatibility metadata",async()=>{
  access.mockResolvedValue(false);const result=await getApiPanel({appViewId:"p",contractId:"c",userId:"u",consumerFeatures:PANEL_FEATURES,query:{}});expect(result.ok).toBe(false);if(result.ok)throw Error();expect(result.response.status).toBe(403);expect(app).not.toHaveBeenCalled();expect(records).not.toHaveBeenCalled();
 });
 it("binds the admitted/projection representation while leaving unrelated resources unchanged",()=>{
  const legacy={views:[{id:"legacy",type:"RECORDS"}]};expect(panelReadRepresentation(legacy)).toBeUndefined();
  const admitted=projectPanelViewsForConsumer([view()],PANEL_FEATURES),blocked=projectPanelViewsForConsumer([view()],[]);
  expect(panelReadRepresentation({views:admitted})).not.toEqual(panelReadRepresentation({views:blocked}));
  expect(panelReadRepresentation({panelCompatibility:admitted[0].panelCompatibility})).toEqual(admitted[0].panelCompatibility);
 });
 it("withdraws only incompatible PANEL reuse offers even with current receipts, preserving V1, vectors and Attendance",async()=>{
  vi.stubEnv("OPCO_OFFLINE_GENERIC_REUSE_POLICY","verified-coverage-runtime-v1");
  vi.stubEnv("OPCO_OFFLINE_REUSE_POLICY","attendance-runtime-v1");vi.stubEnv("OPCO_OFFLINE_REUSE_CONTRACT_IDS","c");
  try {
   const i=panelFixtureIds,definitions=panelFixtureDefinitions().map(d=>({...d,isActive:true,scheduleConfig:null}));
   const assigned=[{...view(),active:true}, {id:"records",type:"RECORDS",active:true,config:{entityTypeId:i.workers}},
    {id:"attendance",type:"WORKFLOW",active:true,config:{workflowKey:"attendance",sourceEntityTypeId:i.workers,targetEntityTypeId:i.events,personFieldId:i.worker,dateFieldId:i.date,statusFieldId:i.status,defaultCheckInOptionId:i.optionA}}];
   catalog.mockResolvedValue({epoch:"stable-epoch",attestationHash:"signature",tracking:"installed"});
   revisions.mockResolvedValue(definitions.map(d=>({entityTypeId:d.id,dataRevision:"1"})));
   const tx={user:{findUnique:async()=>({id:"u",active:true})},externalApp:{findUnique:async()=>({id:"app",active:true,organizationId:"org",clientId:"client"})},
    contract:{findUnique:async()=>({id:"c",status:"ACTIVE",organizationId:"org",organization:{id:"org",active:true}})},membership:{findUnique:async()=>({role:"ADMIN"})},
    appView:{findMany:async()=>assigned},entityType:{findMany:async()=>definitions},$queryRaw:async()=>[{at:new Date("2026-11-18T00:00:00Z")}]};
   const query=parseOfflineManifestRequest(new URLSearchParams("version=2&nonce=event_0123456789abcdef&readRepresentationVersion=1&receiptVersion=1&storagePolicyVersion=3&month=2026-11"));
   const scope={appId:"app",userId:"u",contractId:"c"};
   const old=await buildOfflineManifest(tx as never,scope,query),partial=await buildOfflineManifest(tx as never,{...scope,panelConsumerFeatures:["groups-v1"]},query),capable=await buildOfflineManifest(tx as never,{...scope,panelConsumerFeatures:PANEL_FEATURES},query);
   for(const result of[old,partial])expect(result.negotiation?.genericReuse?.views.map(v=>v.appViewId)).toEqual(["records","attendance"]);
   expect(capable.negotiation?.genericReuse?.views.map(v=>v.appViewId)).toEqual(["p","records","attendance"]);
   for(const result of[old,partial,capable]){
    expect(result.negotiation?.selectiveReuse).toMatchObject({enabled:true,appViewIds:["attendance"]});
    expect(result.readBindingVector).toEqual(old.readBindingVector);expect(result.manifestRevision).toEqual(old.manifestRevision);
   }
   const v1=parseOfflineManifestRequest(new URLSearchParams("version=1"));
   expect(await buildOfflineManifest(tx as never,scope,v1)).toEqual(await buildOfflineManifest(tx as never,{...scope,panelConsumerFeatures:PANEL_FEATURES},v1));
   expect(records).not.toHaveBeenCalled();
  }finally{vi.unstubAllEnvs();}
 });

});
